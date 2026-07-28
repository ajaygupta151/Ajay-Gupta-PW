/* ============================================
   CADENCE REPORT - JavaScript
   Dashboard with Dynamic Sheet-Based Role Hierarchy
   ============================================ */

document.addEventListener('DOMContentLoaded', initDashboard);

// Also run if DOMContentLoaded already fired
if (document.readyState !== 'loading') initDashboard();

async function initDashboard() {
    // Prevent double-init
    if (window.__cadenceInitDone) return;
    window.__cadenceInitDone = true;

    // ========== SESSION CHECK ==========
    const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
    if (!session.email) {
        window.location.href = 'login.html';
        return;
    }

    try {

    // =============================================
    // 1. FETCH LIVE DATA FROM GOOGLE SHEETS
    // =============================================
    let sheetRows = [];
    let orgData = { regions: [] };

    try {
        showToast('Loading data from sheet...', 'info');
        sheetRows = await fetchSheetData();
        orgData = buildOrgDataFromSheet(sheetRows);
        showToast('Data loaded successfully!', 'success');
    } catch (error) {
        console.error('Failed to fetch sheet data:', error);
        showToast('Failed to load sheet data. Using cached data.', 'error');
        // Try to load from localStorage
        const cached = localStorage.getItem('cadence-org-data');
        if (cached) {
            orgData = JSON.parse(cached);
        }
    }

    // Build org data from sheet rows
    function buildOrgDataFromSheet(rows) {
        const regions = {};
        const allUsers = {};
        // Track which BHs/RCLs each hierarchy user manages
        const rbhManagedBHs = {};   // rbhEmail -> Set of bhEmail
        const rbhManagedRCLs = {};  // rbhEmail -> Set of rclEmail
        const rclManagedBHs = {};   // rclEmail -> Set of bhEmail

        // First pass: collect all users and their hierarchy
        rows.forEach(row => {
            const email = row.mail_id ? row.mail_id.toLowerCase().trim() : '';
            const rbhEmail = row.RBH ? row.RBH.toLowerCase().trim() : '';
            const rclEmail = row.RCL ? row.RCL.toLowerCase().trim() : '';
            const bhEmail = row.BH ? row.BH.toLowerCase().trim() : '';
            const region = row.Region || 'Unknown';
            const center = row.Center || '';

            // Track RBH → BH mapping
            if (rbhEmail && rbhEmail !== '-' && bhEmail && bhEmail !== '-') {
                if (!rbhManagedBHs[rbhEmail]) rbhManagedBHs[rbhEmail] = new Set();
                rbhManagedBHs[rbhEmail].add(bhEmail);
            }
            // Track RBH → RCL mapping
            if (rbhEmail && rbhEmail !== '-' && rclEmail && rclEmail !== '-') {
                if (!rbhManagedRCLs[rbhEmail]) rbhManagedRCLs[rbhEmail] = new Set();
                rbhManagedRCLs[rbhEmail].add(rclEmail);
            }
            // Track RCL → BH mapping
            if (rclEmail && rclEmail !== '-' && bhEmail && bhEmail !== '-') {
                if (!rclManagedBHs[rclEmail]) rclManagedBHs[rclEmail] = new Set();
                rclManagedBHs[rclEmail].add(bhEmail);
            }

            // Store user
            if (email) {
                allUsers[email] = {
                    email: email,
                    name: email.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    role: row.employee_type === 'CM' ? 'cl' : (row.employee_type || 'CL').toLowerCase(),
                    region: region,
                    center: center,
                    rcl: rclEmail,
                    bh: bhEmail,
                    rbh: rbhEmail
                };
            }

            // Store RBH
            if (rbhEmail && rbhEmail !== '-' && !allUsers[rbhEmail]) {
                allUsers[rbhEmail] = {
                    email: rbhEmail,
                    name: rbhEmail.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    role: 'rbh',
                    region: region,
                    managedBHs: [],   // will be filled after first pass
                    managedRCLs: []
                };
            }

            // Store RCL
            if (rclEmail && rclEmail !== '-' && !allUsers[rclEmail]) {
                allUsers[rclEmail] = {
                    email: rclEmail,
                    name: rclEmail.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    role: 'rcl',
                    region: region,
                    managedBHs: []
                };
            }

            // Store BH
            if (bhEmail && bhEmail !== '-' && !allUsers[bhEmail]) {
                allUsers[bhEmail] = {
                    email: bhEmail,
                    name: bhEmail.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    role: 'bh',
                    region: region
                };
            }

            // Build region structure
            if (!regions[region]) {
                regions[region] = {
                    id: region.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    name: region,
                    rcls: {},
                    bhs: {},
                    centers: []
                };
            }

            const regionData = regions[region];

            // Add RCL
            if (rclEmail && rclEmail !== '-' && !regionData.rcls[rclEmail]) {
                regionData.rcls[rclEmail] = {
                    id: rclEmail,
                    name: allUsers[rclEmail]?.name || rclEmail,
                    bhs: []
                };
            }

            // Add BH
            if (bhEmail && bhEmail !== '-' && !regionData.bhs[bhEmail]) {
                regionData.bhs[bhEmail] = {
                    id: bhEmail,
                    name: allUsers[bhEmail]?.name || bhEmail,
                    rcl: rclEmail,
                    centers: []
                };
                // Link BH to RCL
                if (rclEmail && rclEmail !== '-' && regionData.rcls[rclEmail]) {
                    regionData.rcls[rclEmail].bhs.push(bhEmail);
                }
            }

            // Add center — must go under BOTH the region AND the parent BH
            if (center && center !== '-') {
                const centerObj = {
                    id: email || center,
                    name: center,
                    cl: email,
                    bh: bhEmail,
                    rcl: rclEmail,
                    tasks: { total: 0, completed: 0, pending: 0, overdue: 0 },
                    monthly: {
                        assigned: new Array(12).fill(0),
                        completed: new Array(12).fill(0),
                        overdue: new Array(12).fill(0)
                    }
                };

                // Push to region's flat list (for reference)
                regionData.centers.push(centerObj);

                // ALSO push to the parent BH's centers array (this is what getAllCenters iterates)
                if (bhEmail && bhEmail !== '-' && regionData.bhs[bhEmail]) {
                    regionData.bhs[bhEmail].centers.push(centerObj);
                }
            }
        });

        // ---- Fill managedBHs / managedRCLs for hierarchy users ----
        Object.keys(rbhManagedBHs).forEach(rbhEmail => {
            if (allUsers[rbhEmail]) {
                allUsers[rbhEmail].managedBHs = [...rbhManagedBHs[rbhEmail]];
            }
        });
        Object.keys(rbhManagedRCLs).forEach(rbhEmail => {
            if (allUsers[rbhEmail]) {
                allUsers[rbhEmail].managedRCLs = [...rbhManagedRCLs[rbhEmail]];
            }
        });
        Object.keys(rclManagedBHs).forEach(rclEmail => {
            if (allUsers[rclEmail]) {
                allUsers[rclEmail].managedBHs = [...rclManagedBHs[rclEmail]];
            }
        });

        // Convert to array format
        const regionsArray = Object.values(regions).map(region => ({
            ...region,
            rcls: Object.values(region.rcls),
            bhs: Object.values(region.bhs)
        }));

        return { regions: regionsArray, users: allUsers };
    }

    // =============================================
    // 2. ROLE DEFINITIONS & HIERARCHY
    // =============================================
    const ROLES = {
        admin: { level: 5, label: 'Admin', icon: 'fas fa-user-shield', canSee: 'everything' },
        rbh:   { level: 4, label: 'RBH',   icon: 'fas fa-city',        canSee: 'all_rcl_bh_cl' },
        rcl:   { level: 3, label: 'RCL',   icon: 'fas fa-sitemap',     canSee: 'bh_cl_only' },
        bh:    { level: 2, label: 'BH',    icon: 'fas fa-building',     canSee: 'own_centers' },
        cl:    { level: 1, label: 'CL',    icon: 'fas fa-user-tie',     canSee: 'own_center_only' }
    };

    let currentRole = session.role || 'admin';
    let cadenceChart = null;

    // Helper: convert raw region name to slugified region ID
    function regionNameToId(name) {
        if (!name) return '';
        return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    }

    // =============================================
    // 3. HELPER: FLATTEN & FILTER DATA
    // =============================================
    function getAllCenters(regionFilter, bhFilter, rclFilter, centerFilter) {
        let centers = [];
        orgData.regions.forEach(region => {
            if (regionFilter && region.id !== regionFilter) return;
            region.bhs.forEach(bh => {
                if (bhFilter && bh.id !== bhFilter) return;
                // RCL filter: only include BH if any selected RCL manages it
                if (rclFilter) {
                    const rcl = region.rcls.find(r => r.id === rclFilter);
                    if (rcl && !rcl.bhs.includes(bh.id)) return;
                }
                bh.centers.forEach(center => {
                    if (centerFilter && center.id !== centerFilter) return;
                    centers.push({
                        ...center,
                        regionId: region.id,
                        regionName: region.name,
                        bhId: bh.id,
                        bhName: bh.name
                    });
                });
            });
        });
        return centers;
    }

    function getVisibleData(filters = {}) {
        const { region, bh, rcl, center, cl } = filters;
        const role = ROLES[currentRole];
        const user = session;

        // Role-based restrictions
        let allowedRegions = null;
        let allowedBHs = null;
        let allowedRCLs = null;
        let allowedCenters = null;

        if (role.level <= 1) {
            // CL: own center only
            allowedCenters = [user.center];
        } else if (role.level <= 2) {
            // BH: own centers only
            const bhData = findBH(user.bh);
            allowedBHs = [user.bh];
            allowedCenters = bhData ? bhData.centers.map(c => c.id) : [];
        } else if (role.level <= 3) {
            // RCL: only BHs this RCL manages
            const rclUserData = orgData.users[user.email];
            const rclData = findRCL(user.rcl || user.email);
            if (rclUserData && rclUserData.managedBHs && rclUserData.managedBHs.length > 0) {
                allowedBHs = rclUserData.managedBHs;
            } else if (rclData) {
                allowedBHs = rclData.bhs;
            }
        } else if (role.level <= 4) {
            // RBH: only BHs + RCLs this RBH manages
            const rbhUserData = orgData.users[user.email];
            if (rbhUserData && rbhUserData.managedBHs && rbhUserData.managedBHs.length > 0) {
                allowedBHs = rbhUserData.managedBHs;
            }
            if (rbhUserData && rbhUserData.managedRCLs && rbhUserData.managedRCLs.length > 0) {
                allowedRCLs = rbhUserData.managedRCLs;
            }
            // Use slugified region ID to match region.id
            allowedRegions = [regionNameToId(user.region)];
        }
        // level 5 (admin): no restrictions

        // Merge role restrictions with filter selections
        let finalRegion = region;
        let finalBH = bh;
        let finalRCL = rcl;
        let finalCenter = center;

        if (allowedRegions) finalRegion = allowedRegions[0];
        if (allowedBHs && !bh) finalBH = '';
        if (allowedCenters && !center) finalCenter = '';

        let centers = getAllCenters(
            finalRegion || '',
            (allowedBHs && allowedBHs.length === 1) ? allowedBHs[0] : (finalBH || ''),
            finalRCL || '',
            finalCenter || ''
        );

        // Further filter by allowed lists
        if (allowedBHs && allowedBHs.length > 0) {
            centers = centers.filter(c => allowedBHs.includes(c.bhId));
        }
        if (allowedCenters && allowedCenters.length > 0) {
            centers = centers.filter(c => allowedCenters.includes(c.id));
        }

        // CL filter
        if (cl) {
            centers = centers.filter(c => c.cl === cl);
        }

        return centers;
    }

    function findBH(bhId) {
        for (const region of orgData.regions) {
            for (const bh of region.bhs) {
                if (bh.id === bhId) return bh;
            }
        }
        return null;
    }

    function findRCL(rclId) {
        for (const region of orgData.regions) {
            for (const rcl of region.rcls) {
                if (rcl.id === rclId) return rcl;
            }
        }
        return null;
    }

    function aggregateTasks(centers) {
        const agg = { total: 0, completed: 0, pending: 0, overdue: 0 };
        const monthly = { assigned: new Array(12).fill(0), completed: new Array(12).fill(0), overdue: new Array(12).fill(0) };

        centers.forEach(c => {
            agg.total += c.tasks.total;
            agg.completed += c.tasks.completed;
            agg.pending += c.tasks.pending;
            agg.overdue += c.tasks.overdue;
            for (let i = 0; i < 12; i++) {
                monthly.assigned[i] += c.monthly.assigned[i];
                monthly.completed[i] += c.monthly.completed[i];
                monthly.overdue[i] += c.monthly.overdue[i];
            }
        });

        return { agg, monthly };
    }

    // =============================================
    // 4. POPULATE FILTER DROPDOWNS
    // =============================================

    // Helper: get allowed BHs for current role user
    function getAllowedBHs() {
        const user = session;
        const role = ROLES[currentRole];
        if (role.level <= 2) return [user.bh]; // BH: own BH only
        if (role.level <= 3) {
            // RCL: managed BHs
            const u = orgData.users[user.email];
            return (u && u.managedBHs) ? u.managedBHs : [];
        }
        if (role.level <= 4) {
            // RBH: managed BHs
            const u = orgData.users[user.email];
            return (u && u.managedBHs) ? u.managedBHs : [];
        }
        return null; // admin: no restriction
    }

    // Helper: get allowed RCLs for current role user
    function getAllowedRCLs() {
        const user = session;
        const role = ROLES[currentRole];
        if (role.level <= 3) {
            // RCL: only self
            return [user.rcl || user.email];
        }
        if (role.level <= 4) {
            // RBH: managed RCLs
            const u = orgData.users[user.email];
            return (u && u.managedRCLs) ? u.managedRCLs : [];
        }
        return null; // admin: no restriction
    }

    function populateRegionFilter() {
        const sel = document.getElementById('filterRegion');
        sel.innerHTML = '<option value="">All Regions</option>';
        orgData.regions.forEach(r => {
            sel.innerHTML += `<option value="${r.id}">${r.name}</option>`;
        });
    }

    function populateBHFilter(regionId) {
        const sel = document.getElementById('filterBH');
        sel.innerHTML = '<option value="">All BH</option>';
        const allowedBHs = getAllowedBHs();
        orgData.regions.forEach(r => {
            if (regionId && r.id !== regionId) return;
            r.bhs.forEach(bh => {
                // Role restriction: only show allowed BHs
                if (allowedBHs && !allowedBHs.includes(bh.id)) return;
                sel.innerHTML += `<option value="${bh.id}">${bh.name} (${r.name})</option>`;
            });
        });
    }

    function populateRCLFilter(regionId, bhId) {
        const sel = document.getElementById('filterRCL');
        sel.innerHTML = '<option value="">All RCL</option>';
        const allowedRCLs = getAllowedRCLs();
        orgData.regions.forEach(r => {
            if (regionId && r.id !== regionId) return;
            r.rcls.forEach(rcl => {
                // Role restriction: only show allowed RCLs
                if (allowedRCLs && !allowedRCLs.includes(rcl.id)) return;
                // If BH is selected, only show RCLs that manage that BH
                if (bhId && !rcl.bhs.includes(bhId)) return;
                sel.innerHTML += `<option value="${rcl.id}">${rcl.name} (${r.name})</option>`;
            });
        });
    }

    function populateCenterFilter(regionId, bhId, rclId) {
        const sel = document.getElementById('filterCenter');
        sel.innerHTML = '<option value="">All Centers</option>';
        const role = ROLES[currentRole];
        const user = session;
        // CL: only own center
        if (role.level <= 1) {
            const c = findCenterById(user.center);
            sel.innerHTML += `<option value="${user.center}">${c ? c.name : user.center}</option>`;
            return;
        }
        orgData.regions.forEach(r => {
            if (regionId && r.id !== regionId) return;
            r.bhs.forEach(bh => {
                if (bhId && bh.id !== bhId) return;
                // RCL filter
                if (rclId) {
                    const rcl = r.rcls.find(rc => rc.id === rclId);
                    if (rcl && !rcl.bhs.includes(bh.id)) return;
                }
                bh.centers.forEach(c => {
                    sel.innerHTML += `<option value="${c.id}">${c.name} (${bh.name})</option>`;
                });
            });
        });
    }

    function populateCLFilter(regionId, bhId, rclId, centerId) {
        const sel = document.getElementById('filterCL');
        sel.innerHTML = '<option value="">All CL</option>';
        const role = ROLES[currentRole];
        const user = session;
        // CL: only self
        if (role.level <= 1) {
            sel.innerHTML += `<option value="${user.email}">${user.name}</option>`;
            return;
        }
        orgData.regions.forEach(r => {
            if (regionId && r.id !== regionId) return;
            r.bhs.forEach(bh => {
                if (bhId && bh.id !== bhId) return;
                if (rclId) {
                    const rcl = r.rcls.find(rc => rc.id === rclId);
                    if (rcl && !rcl.bhs.includes(bh.id)) return;
                }
                bh.centers.forEach(c => {
                    if (centerId && c.id !== centerId) return;
                    const clUser = orgData.users[c.cl];
                    sel.innerHTML += `<option value="${c.cl}">${clUser?.name || c.cl} (${c.name})</option>`;
                });
            });
        });
    }

    // Helper: find center by id across all regions
    function findCenterById(centerId) {
        for (const region of orgData.regions) {
            for (const bh of region.bhs) {
                for (const c of bh.centers) {
                    if (c.id === centerId) return c;
                }
            }
        }
        return null;
    }

    // =============================================
    // 5. CASCADE: When upper filter changes, update lower filters
    // =============================================
    function onFilterChange(changedFilter) {
        const region = document.getElementById('filterRegion').value;

        // Populate BH if region changed or full rebuild
        if (changedFilter === 'region' || !changedFilter) {
            populateBHFilter(region);
            autoSelectOrShow('filterBH', 'filterBHGroup');
        }

        const bh = document.getElementById('filterBH').value;

        // Populate RCL if BH or region changed, or full rebuild
        if (changedFilter === 'region' || changedFilter === 'bh' || !changedFilter) {
            populateRCLFilter(region, bh);
            autoSelectOrShow('filterRCL', 'filterRCLGroup');
        }

        const rcl = document.getElementById('filterRCL').value;

        // Populate Center if any parent changed, or full rebuild
        if (changedFilter === 'region' || changedFilter === 'bh' || changedFilter === 'rcl' || !changedFilter) {
            populateCenterFilter(region, bh, rcl);
            autoSelectOrShow('filterCenter', 'filterCenterGroup');
        }

        const center = document.getElementById('filterCenter').value;

        // Populate CL if any parent changed, or full rebuild
        if (changedFilter === 'region' || changedFilter === 'bh' || changedFilter === 'rcl' || changedFilter === 'center' || !changedFilter) {
            populateCLFilter(region, bh, rcl, center);
            autoSelectOrShow('filterCL', 'filterCLGroup');
        }

        // Auto-update dashboard on every filter change
        updateDashboard();
    }

    /**
     * Auto-select if only 1 real option, hide group.
     * If multiple options, show group so user can choose.
     */
    function autoSelectOrShow(selId, groupId) {
        const selectEl = document.getElementById(selId);
        const groupEl = document.getElementById(groupId);
        if (!selectEl || !groupEl) return;

        const realOptions = Array.from(selectEl.options).filter(o => o.value !== '');

        if (realOptions.length === 1) {
            selectEl.value = realOptions[0].value;
            groupEl.style.display = 'none';
        } else {
            groupEl.style.display = '';
        }
    }

    // =============================================
    // 6. ROLE-BASED FILTER LOCKING
    // =============================================
    function applyRoleRestrictions() {
        const user = session;
        const role = ROLES[currentRole];

        const regionSel = document.getElementById('filterRegion');
        const bhSel = document.getElementById('filterBH');
        const rclSel = document.getElementById('filterRCL');
        const centerSel = document.getElementById('filterCenter');
        const clSel = document.getElementById('filterCL');

        // Unlock everything first
        [regionSel, bhSel, rclSel, centerSel, clSel].forEach(s => {
            s.disabled = false;
        });

        // Update sidebar user info
        const sidebarUserName = document.getElementById('sidebarUserName');
        const sidebarUserRole = document.getElementById('sidebarUserRole');
        const sidebarAvatar = document.getElementById('sidebarAvatar');
        if (sidebarUserName) sidebarUserName.textContent = user.name;
        if (sidebarUserRole) sidebarUserRole.textContent = role.label;
        if (sidebarAvatar) sidebarAvatar.innerHTML = `<i class="${role.icon}"></i>`;

        // Convert raw region name to slugified ID for dropdown matching
        const userRegionId = regionNameToId(user.region);

        // ---- ROLE-SPECIFIC FILTER LOCKING & AUTO-SELECT ----

        if (role.level <= 1) {
            // CL: lock everything, auto-select their center
            regionSel.value = userRegionId;
            regionSel.disabled = true;
            bhSel.value = user.bh;
            bhSel.disabled = true;
            centerSel.value = user.center;
            centerSel.disabled = true;
            clSel.value = user.email;
            clSel.disabled = true;
            rclSel.disabled = true;

        } else if (role.level <= 2) {
            // BH: lock region + BH, auto-select
            regionSel.value = userRegionId;
            regionSel.disabled = true;
            bhSel.value = user.bh;
            bhSel.disabled = true;

        } else if (role.level <= 3) {
            // RCL: lock region, auto-select; BH/Center cascaded
            regionSel.value = userRegionId;
            regionSel.disabled = true;

        } else if (role.level <= 4) {
            // RBH: lock region, auto-select; BH/RCL/Center cascaded
            regionSel.value = userRegionId;
            regionSel.disabled = true;

        } else {
            // Admin: reset all filters to default
            regionSel.value = '';
            bhSel.value = '';
            rclSel.value = '';
            centerSel.value = '';
            clSel.value = '';
        }

        // ---- CASCADE: repopulate lower dropdowns ----
        onFilterChange();

        // Debug: show current role restrictions
        const currentAllowedBHs = getAllowedBHs();
        const currentAllowedRCLs = getAllowedRCLs();
        console.log(`[CADENCE] Role: ${role.label} | User: ${user.email} | Region: ${user.region} → ${userRegionId} | Allowed BHs: ${JSON.stringify(currentAllowedBHs || 'all')} | Allowed RCLs: ${JSON.stringify(currentAllowedRCLs || 'all')}`);

        // ---- AUTO-SELECT single BH for BH role ----
        if (role.level <= 2 && user.bh) {
            bhSel.value = user.bh;
            // Cascade down (don't rebuild BH, just the lower filters)
            onFilterChange('bh');
        }
    }

    // =============================================
    // 7. UPDATE DASHBOARD (KPIs + Chart + Team)
    // =============================================
    function updateDashboard() {
        const region = document.getElementById('filterRegion').value;
        const bh = document.getElementById('filterBH').value;
        const rcl = document.getElementById('filterRCL').value;
        const center = document.getElementById('filterCenter').value;
        const cl = document.getElementById('filterCL').value;

        const centers = getVisibleData({ region, bh, rcl, center, cl });
        const { agg, monthly } = aggregateTasks(centers);

        // Update KPIs
        animateCounter('totalTasks', agg.total);
        animateCounter('completedTasks', agg.completed);
        animateCounter('pendingTasks', agg.pending);
        animateCounter('overdueTasks', agg.overdue);

        // Update KPI trends
        updateTrend('trendTotal', agg.total, centers.length * 10);
        updateTrend('trendCompleted', agg.completed, agg.total);
        updateTrend('trendPending', agg.pending, agg.total);
        updateTrend('trendOverdue', agg.overdue, agg.total);

        // Update Chart
        updateChart(monthly);

        // Update Team Performance
        updateTeamList(centers);

        // Update Filter Tags
        updateFilterTags();
    }

    function updateTrend(elementId, value, total) {
        const el = document.getElementById(elementId);
        if (!el || total === 0) return;
        const pct = Math.round((value / total) * 100);
        const isDown = elementId.includes('Overdue') || elementId.includes('Pending');
        el.className = `kpi-trend ${isDown ? (pct < 15 ? 'up' : 'down') : (pct > 50 ? 'up' : 'down')}`;
        el.innerHTML = `<i class="fas fa-arrow-${isDown ? (pct < 15 ? 'up' : 'down') : (pct > 50 ? 'up' : 'down')}"></i><span>${pct}%</span>`;
    }

    function updateChart(monthly) {
        if (!cadenceChart) return;
        cadenceChart.data.datasets[0].data = monthly.assigned;
        cadenceChart.data.datasets[1].data = monthly.completed;
        cadenceChart.data.datasets[2].data = monthly.overdue;
        cadenceChart.update('active');
    }

    function updateTeamList(centers) {
        const container = document.getElementById('teamList');
        if (!container) return;

        // Gather unique CLs from visible centers
        const clMap = {};
        centers.forEach(c => {
            const clEmail = c.cl;
            if (clEmail && !clMap[clEmail]) {
                const clUser = orgData.users[clEmail];
                clMap[clEmail] = { 
                    name: clUser?.name || clEmail, 
                    center: c.name, 
                    tasks: c.tasks 
                };
            } else if (clEmail && clMap[clEmail]) {
                clMap[clEmail].tasks.total += c.tasks.total;
                clMap[clEmail].tasks.completed += c.tasks.completed;
            }
        });

        let html = '';
        Object.values(clMap).forEach(person => {
            const pct = person.tasks.total > 0 ? Math.round((person.tasks.completed / person.tasks.total) * 100) : 0;
            const initials = person.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            html += `
                <div class="team-member">
                    <div class="member-info">
                        <div class="member-avatar">${initials}</div>
                        <div>
                            <h4>${person.name}</h4>
                            <span>${person.center}</span>
                        </div>
                    </div>
                    <div class="member-stats">
                        <div class="progress-bar">
                            <div class="progress" style="width: 0%;" data-progress="${pct}"></div>
                        </div>
                        <span class="progress-label">${pct}%</span>
                    </div>
                </div>`;
        });

        if (Object.keys(clMap).length === 0) {
            html = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No team members found for current filters.</p>';
        }

        container.innerHTML = html;

        // Re-observe progress bars
        const bars = container.querySelectorAll('.progress');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const bar = entry.target;
                    setTimeout(() => {
                        bar.style.width = bar.getAttribute('data-progress') + '%';
                    }, 200);
                    observer.unobserve(bar);
                }
            });
        }, { threshold: 0.5 });
        bars.forEach(bar => observer.observe(bar));
    }

    function updateFilterTags() {
        const container = document.getElementById('activeFilters');
        const tagsEl = document.getElementById('filterTags');
        const tags = [];

        const region = document.getElementById('filterRegion');
        const bh = document.getElementById('filterBH');
        const rcl = document.getElementById('filterRCL');
        const center = document.getElementById('filterCenter');
        const cl = document.getElementById('filterCL');

        if (region.value) tags.push({ label: 'Region', value: region.options[region.selectedIndex].text, clearId: 'filterRegion' });
        if (bh.value) tags.push({ label: 'BH', value: bh.options[bh.selectedIndex].text, clearId: 'filterBH' });
        if (rcl.value) tags.push({ label: 'RCL', value: rcl.options[rcl.selectedIndex].text, clearId: 'filterRCL' });
        if (center.value) tags.push({ label: 'Center', value: center.options[center.selectedIndex].text, clearId: 'filterCenter' });
        if (cl.value) tags.push({ label: 'CL', value: cl.options[cl.selectedIndex].text, clearId: 'filterCL' });

        if (tags.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        tagsEl.innerHTML = tags.map(t =>
            `<span class="filter-tag"><strong>${t.label}:</strong> ${t.value} <i class="fas fa-times" data-clear="${t.clearId}"></i></span>`
        ).join('');

        // Tag remove handlers
        tagsEl.querySelectorAll('.fa-times').forEach(icon => {
            icon.addEventListener('click', () => {
                const selId = icon.getAttribute('data-clear');
                document.getElementById(selId).value = '';
                onFilterChange();  // no arg = rebuild all
            });
        });
    }

    // =============================================
    // 8. ANIMATED COUNTER
    // =============================================
    function animateCounter(elementId, target, duration = 800) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const start = parseInt(el.textContent) || 0;
        if (start === target) return;
        let current = start;
        const increment = (target - start) / (duration / 16);
        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= target) || (increment < 0 && current <= target) || increment === 0) {
                el.textContent = target;
                clearInterval(timer);
            } else {
                el.textContent = Math.floor(current);
            }
        }, 16);
    }

    // =============================================
    // 9. CHART INITIALIZATION
    // =============================================
    function initChart() {
        const ctx = document.getElementById('cadenceChart');
        if (!ctx) return;
        const chartCtx = ctx.getContext('2d');

        const gradientBlue = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradientBlue.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
        gradientBlue.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

        const gradientGreen = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradientGreen.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
        gradientGreen.addColorStop(1, 'rgba(34, 197, 94, 0.0)');

        const gradientOrange = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradientOrange.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
        gradientOrange.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

        cadenceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [
                    {
                        label: 'Tasks Assigned',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: gradientBlue,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2,
                        pointHoverRadius: 7
                    },
                    {
                        label: 'Tasks Completed',
                        data: [],
                        borderColor: '#22c55e',
                        backgroundColor: gradientGreen,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: '#22c55e',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2,
                        pointHoverRadius: 7
                    },
                    {
                        label: 'Overdue',
                        data: [],
                        borderColor: '#f59e0b',
                        backgroundColor: gradientOrange,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#f59e0b',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2,
                        pointHoverRadius: 6,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: { color: '#94a3b8', usePointStyle: true, pointStyle: 'circle', padding: 20, font: { size: 12, family: 'Inter' } }
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 12 },
                        callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} tasks` }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(51,65,85,0.3)', drawBorder: false }, ticks: { color: '#64748b', font: { size: 11, family: 'Inter' } } },
                    y: { grid: { color: 'rgba(51,65,85,0.3)', drawBorder: false }, ticks: { color: '#64748b', font: { size: 11, family: 'Inter' } }, beginAtZero: true }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });
    }

    // =============================================
    // 10. SIDEBAR TOGGLE
    // =============================================
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mainContent = document.getElementById('mainContent');

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.style.marginLeft = sidebar.classList.contains('collapsed') ? '70px' : '260px';
        });
    }
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    }
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });

    // =============================================
    // 11. EVENT LISTENERS
    // =============================================

    // Filter cascade: when upper filter changes, pass which one changed
    document.getElementById('filterRegion').addEventListener('change', () => onFilterChange('region'));
    document.getElementById('filterBH').addEventListener('change', () => onFilterChange('bh'));
    document.getElementById('filterRCL').addEventListener('change', () => onFilterChange('rcl'));
    document.getElementById('filterCenter').addEventListener('change', () => onFilterChange('center'));

    // Reset Filters
    document.getElementById('filterResetBtn').addEventListener('click', () => {
        const role = ROLES[currentRole];
        if (role.level <= 4) {
            // Don't reset locked filters
            showToast('Some filters are locked by your role.', 'info');
        }
        // Reset unlocked ones
        const regionSel = document.getElementById('filterRegion');
        const bhSel = document.getElementById('filterBH');
        const rclSel = document.getElementById('filterRCL');
        const centerSel = document.getElementById('filterCenter');
        const clSel = document.getElementById('filterCL');
        if (!regionSel.disabled) regionSel.value = '';
        if (!bhSel.disabled) bhSel.value = '';
        if (!rclSel.disabled) rclSel.value = '';
        if (!centerSel.disabled) centerSel.value = '';
        if (!clSel.disabled) clSel.value = '';
        onFilterChange();  // no arg = rebuild all
        showToast('Filters reset!', 'info');
    });

    // Chart period
    document.getElementById('chartPeriod')?.addEventListener('change', (e) => {
        showToast(`Chart updated to ${e.target.value} view`, 'info');
    });

    // Upload modal
    const uploadModal = document.getElementById('uploadModal');
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadBarFill = document.getElementById('uploadBarFill');
    const uploadPercent = document.getElementById('uploadPercent');
    const fileNameEl = document.getElementById('fileName');
    const processBtn = document.getElementById('processUpload');
    let selectedFile = null;

    function openModal() { uploadModal.classList.add('active'); document.body.style.overflow = 'hidden'; }
    function closeModal() { uploadModal.classList.remove('active'); document.body.style.overflow = ''; resetUpload(); }
    function resetUpload() {
        selectedFile = null; uploadZone.style.display = '';
        uploadProgress.style.display = 'none'; uploadBarFill.style.width = '0%';
        uploadPercent.textContent = '0%'; processBtn.disabled = true; fileInput.value = '';
    }

    ['uploadDataBtn', 'uploadBtn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', openModal);
    });
    document.getElementById('closeModal')?.addEventListener('click', closeModal);
    document.getElementById('cancelUpload')?.addEventListener('click', closeModal);
    uploadModal?.addEventListener('click', (e) => { if (e.target === uploadModal) closeModal(); });

    if (uploadZone) {
        uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault(); uploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
        });
    }
    fileInput?.addEventListener('change', () => { if (fileInput.files.length > 0) handleFile(fileInput.files[0]); });

    function handleFile(file) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!['.csv', '.xlsx', '.xls', '.json'].includes(ext)) {
            showToast('Invalid format! Use CSV, Excel, or JSON.', 'error'); return;
        }
        selectedFile = file;
        fileNameEl.textContent = file.name;
        uploadZone.style.display = 'none';
        uploadProgress.style.display = 'block';
        processBtn.disabled = false;
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress >= 100) { progress = 100; clearInterval(interval); showToast(`"${file.name}" uploaded!`, 'success'); }
            uploadBarFill.style.width = progress + '%';
            uploadPercent.textContent = Math.floor(progress) + '%';
        }, 200);
    }

    processBtn?.addEventListener('click', () => {
        if (!selectedFile) return;
        showToast('Processing data...', 'info');
        processBtn.innerHTML = '<i class="fas fa-spinner loading"></i> Processing...';
        processBtn.disabled = true;
        setTimeout(() => { showToast('Data processed!', 'success'); closeModal(); processBtn.innerHTML = '<i class="fas fa-cog"></i> Process Data'; }, 2000);
    });

    // Fullscreen
    document.getElementById('fullscreenBtn')?.addEventListener('click', function () {
        if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(() => {}); this.innerHTML = '<i class="fas fa-compress"></i>'; }
        else { document.exitFullscreen(); this.innerHTML = '<i class="fas fa-expand"></i>'; }
    });

    // Refresh
    document.getElementById('refreshBtn')?.addEventListener('click', function () {
        this.querySelector('i').classList.add('loading');
        showToast('Refreshing...', 'info');
        setTimeout(() => { 
            this.querySelector('i').classList.remove('loading'); 
            // Re-fetch sheet data on refresh
            initDashboard();
        }, 1200);
    });

    // Quick actions
    const qaMsgs = { newReportBtn: 'Opening Report Builder...', exportBtn: 'Generating PDF...', shareBtn: 'Link copied!', scheduleBtn: 'Opening scheduler...', settingsBtn: 'Opening settings...' };
    Object.entries(qaMsgs).forEach(([id, msg]) => {
        document.getElementById(id)?.addEventListener('click', () => {
            if (id === 'settingsBtn') {
                window.location.href = 'settings.html';
            } else {
                showToast(msg, 'info');
            }
        });
    });

    // Search
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.card').forEach(card => {
            const match = q && card.textContent.toLowerCase().includes(q);
            card.style.borderColor = match ? 'var(--accent-blue)' : '';
            card.style.boxShadow = match ? '0 0 0 2px rgba(59,130,246,0.2)' : '';
        });
    });

    // Activity & team member clicks
    document.querySelectorAll('.activity-item').forEach(item => {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => showToast('Activity details coming soon!', 'info'));
    });
    document.getElementById('viewReportsBtn')?.addEventListener('click', () => showToast('Reports section coming soon!', 'info'));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.getElementById('searchInput')?.focus(); }
        if (e.key === 'Escape') closeModal();
    });

    // =============================================
    // 12. TOAST SYSTEM
    // =============================================
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const icons = { success: 'fas fa-check-circle', error: 'fas fa-exclamation-circle', info: 'fas fa-info-circle' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="${icons[type] || icons.info} toast-icon"></i><span class="toast-message">${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // =============================================
    // 13. INITIALIZATION
    // =============================================
    populateRegionFilter();
    populateBHFilter('');
    populateRCLFilter('', '');
    populateCenterFilter('', '', '');
    populateCLFilter('', '', '', '');
    initChart();
    applyRoleRestrictions();
    updateDashboard();

    // Welcome animation
    const welcomeSection = document.querySelector('.welcome-section');
    if (welcomeSection) {
        welcomeSection.style.opacity = '0';
        welcomeSection.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            welcomeSection.style.transition = 'all 0.6s ease';
            welcomeSection.style.opacity = '1';
            welcomeSection.style.transform = 'translateY(0)';
        }, 100);
    }

    // ========== LOGOUT ==========
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to sign out?')) {
            localStorage.removeItem('cadence-session');
            window.location.href = 'login.html';
        }
    });

    // ========== FORCED PASSWORD CHANGE (DEFAULT PASSWORD) ==========
    if (session.isDefaultPassword) {
        setTimeout(() => showForcePasswordModal(), 1500);
    }

    function showForcePasswordModal() {
        const modal = document.getElementById('forcePasswordModal');
        if (!modal) return;
        modal.style.display = 'flex';

        // Strength checker
        document.getElementById('forceNewPassword')?.addEventListener('input', () => {
            const val = document.getElementById('forceNewPassword').value;
            let score = 0;
            if (val.length >= 8) score++;
            if (/[A-Z]/.test(val)) score++;
            if (/[a-z]/.test(val)) score++;
            if (/[0-9]/.test(val)) score++;
            if (/[^A-Za-z0-9]/.test(val)) score++;
            const levels = [
                { width: '0%', color: 'transparent', label: '' },
                { width: '20%', color: '#ef4444', label: 'Weak' },
                { width: '40%', color: '#f97316', label: 'Fair' },
                { width: '60%', color: '#eab308', label: 'Good' },
                { width: '80%', color: '#22c55e', label: 'Strong' },
                { width: '100%', color: '#22c55e', label: 'Very Strong' }
            ];
            const level = levels[score] || levels[0];
            document.getElementById('forceStrengthFill').style.width = level.width;
            document.getElementById('forceStrengthFill').style.background = level.color;
            document.getElementById('forceStrengthText').textContent = level.label;
            document.getElementById('forceStrengthText').style.color = level.color;
        });

        // Confirm match
        document.getElementById('forceConfirmPassword')?.addEventListener('input', () => {
            const val = document.getElementById('forceConfirmPassword').value;
            const newPw = document.getElementById('forceNewPassword').value;
            const status = document.getElementById('forceConfirmStatus');
            if (!val) { status.className = 'input-status'; status.innerHTML = ''; return; }
            if (val === newPw) {
                status.className = 'input-status valid';
                status.innerHTML = '<i class="fas fa-check-circle" style="color: #22c55e;"></i>';
            } else {
                status.className = 'input-status invalid';
                status.innerHTML = '<i class="fas fa-times-circle" style="color: #ef4444;"></i>';
            }
        });

        // Change password button
        document.getElementById('forceChangeBtn')?.addEventListener('click', async () => {
            const newPw = document.getElementById('forceNewPassword').value;
            const confirmPw = document.getElementById('forceConfirmPassword').value;
            const error = document.getElementById('forceError');
            const btn = document.getElementById('forceChangeBtn');

            error.textContent = '';
            if (newPw.length < 8) { error.textContent = 'Password must be at least 8 characters'; return; }
            if (newPw === 'Acer@1234') { error.textContent = 'Please choose a different password from the default'; return; }
            if (newPw !== confirmPw) { error.textContent = 'Passwords do not match'; return; }

            btn.querySelector('.btn-text').style.display = 'none';
            btn.querySelector('.btn-loader').style.display = 'inline';
            btn.disabled = true;

            try {
                const result = await changeUserPassword(session.email, newPw);
                if (!result.success) {
                    error.textContent = result.error;
                    btn.querySelector('.btn-text').style.display = '';
                    btn.querySelector('.btn-loader').style.display = 'none';
                    btn.disabled = false;
                    return;
                }

                session.isDefaultPassword = false;
                localStorage.setItem('cadence-session', JSON.stringify(session));
                modal.style.display = 'none';
                showToast('Password updated successfully! Welcome to CADENCE.', 'success');
            } catch (err) {
                error.textContent = 'Failed to update password';
            }

            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;
        });

        // Skip button
        document.getElementById('forceSkipBtn')?.addEventListener('click', () => {
            modal.style.display = 'none';
            showToast('Remember to change your password from Settings.', 'info');
        });
    }

    console.log('%c CADENCE Report Dashboard Loaded ', 'background: linear-gradient(135deg, #3b82f6, #a855f7); color: white; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 14px;');

    } catch (err) {
        console.error('CADENCE Init Error:', err);
        document.title = 'INIT_ERROR: ' + err.message + ' at ' + (err.stack || '').split('\n')[1];
    }
}

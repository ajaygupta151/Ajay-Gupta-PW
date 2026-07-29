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
            console.log(`[CASCADE] populateCenterFilter: CL role, added own center '${user.center}'`);
            return;
        }
        let count = 0;
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
                    count++;
                });
            });
        });
        console.log(`[CASCADE] populateCenterFilter: region='${regionId}' bh='${bhId}' rcl='${rclId}' → added ${count} centers`);
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
        console.log(`[CASCADE] onFilterChange called with: '${changedFilter}' | region='${region}'`);

        // Populate BH if region changed or full rebuild
        if (changedFilter === 'region' || !changedFilter) {
            populateBHFilter(region);
            autoSelectOrShow('filterBH', 'filterBHGroup');
        }

        const bh = document.getElementById('filterBH').value;
        console.log(`[CASCADE] current BH value: '${bh}'`);

        // Populate RCL if BH or region changed, or full rebuild
        if (changedFilter === 'region' || changedFilter === 'bh' || !changedFilter) {
            console.log(`[CASCADE] → populating RCL with region='${region}' bh='${bh}'`);
            populateRCLFilter(region, bh);
            autoSelectOrShow('filterRCL', 'filterRCLGroup');
        }

        const rcl = document.getElementById('filterRCL').value;
        console.log(`[CASCADE] current RCL value: '${rcl}'`);

        // Populate Center if any parent changed, or full rebuild
        if (changedFilter === 'region' || changedFilter === 'bh' || changedFilter === 'rcl' || !changedFilter) {
            console.log(`[CASCADE] → populating Center with region='${region}' bh='${bh}' rcl='${rcl}'`);
            populateCenterFilter(region, bh, rcl);
            autoSelectOrShow('filterCenter', 'filterCenterGroup');
        }

        const center = document.getElementById('filterCenter').value;
        console.log(`[CASCADE] current Center value: '${center}'`);

        // Populate CL if any parent changed, or full rebuild
        if (changedFilter === 'region' || changedFilter === 'bh' || changedFilter === 'rcl' || changedFilter === 'center' || !changedFilter) {
            console.log(`[CASCADE] → populating CL with region='${region}' bh='${bh}' rcl='${rcl}' center='${center}'`);
            populateCLFilter(region, bh, rcl, center);
            autoSelectOrShow('filterCL', 'filterCLGroup');
        }

        // Auto-update dashboard on every filter change
        updateDashboard();
    }

    /**
     * Auto-select if only 1 real option.
     * Keep group always visible so user can manually change selection.
     */
    function autoSelectOrShow(selId, groupId) {
        const selectEl = document.getElementById(selId);
        const groupEl = document.getElementById(groupId);
        if (!selectEl || !groupEl) return;

        const realOptions = Array.from(selectEl.options).filter(o => o.value !== '');

        if (realOptions.length === 1) {
            selectEl.value = realOptions[0].value;
        }
        // Always keep visible — user should be able to change any dropdown
        groupEl.style.display = '';
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
        // datasets 3 (Audits) and 4 (Meetings) are updated by overviewChartUpdate()
        cadenceChart.update('active');
    }

    /* Populate user selector + update audit/meeting chart lines */
    function initOverviewUserSelect() {
        if (window.__overviewSelectDone) return;
        window.__overviewSelectDone = true;

        const sel = document.getElementById('overviewUserSelect');
        if (!sel) return;

        // Get roleMap from the summary data, or build from sheet
        const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
        const sessionEmail = (session.email || '').toLowerCase().trim();

        // Build roleMap if we have sheet data
        let roleMap = {};
        try {
            const cached = localStorage.getItem('cadence-sheet-data');
            if (cached) {
                const h = buildSummaryHierarchy(JSON.parse(cached));
                roleMap = h.roleMap;
            }
        } catch(e) {}
        if (sessionEmail && !roleMap[sessionEmail]) {
            roleMap[sessionEmail] = session.role || 'CL';
        }

        const emails = Object.keys(roleMap).sort();
        sel.innerHTML = emails.map(e =>
            `<option value="${escHtml(e)}" ${e === sessionEmail ? 'selected' : ''}>${escHtml(e)} (${roleMap[e] || ''})</option>`
        ).join('');

        // Populate form rows from cache for chart data
        window._overviewRoleMap = roleMap;

        // Load form data & update chart
        loadFormDataForChart(sessionEmail);

        // On change
        sel.addEventListener('change', () => {
            loadFormDataForChart(sel.value);
        });
    }

    async function loadFormDataForChart(email) {
        if (!email) return;
        try {
            const resp = await fetch(SUMMARY_CONFIG.WEBAPP_URL + '?action=responses', { method: 'GET', mode: 'cors' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const result = await resp.json();
            if (!result.success) throw new Error('Web app failed');
            const rows = result.data || [];

            // Monthly aggregation
            const auditMonthly = new Array(12).fill(0);
            const meetingMonthly = new Array(12).fill(0);

            rows.forEach(row => {
                const subEmail = (row['Submitted By'] || '').toLowerCase().trim();
                if (subEmail !== email) return;
                const formType = row['Form Type'] || '';
                let dateStr = '';
                if (formType === 'Audits') dateStr = row['Audit Date'] || '';
                else if (formType === '1-1 & Training') dateStr = row['Meeting Date'] || '';
                const d = parseDateFlexible(dateStr);
                if (!d) return;
                const month = d.getMonth(); // 0-based
                if (formType === 'Audits') auditMonthly[month]++;
                else if (formType === '1-1 & Training') meetingMonthly[month]++;
            });

            if (cadenceChart) {
                cadenceChart.data.datasets[3].data = auditMonthly;
                cadenceChart.data.datasets[4].data = meetingMonthly;
                cadenceChart.update('active');
            }
        } catch (err) {
            console.error('Chart form data error:', err);
        }
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

        const gradientAudit = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradientAudit.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
        gradientAudit.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

        const gradientMeeting = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradientMeeting.addColorStop(0, 'rgba(168, 85, 247, 0.2)');
        gradientMeeting.addColorStop(1, 'rgba(168, 85, 247, 0.0)');

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
                    },
                    {
                        label: 'Audits',
                        data: new Array(12).fill(0),
                        borderColor: '#3b82f6',
                        backgroundColor: gradientAudit,
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 4,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2,
                        pointHoverRadius: 6,
                        borderDash: [3, 3]
                    },
                    {
                        label: '1-1 Meetings',
                        data: new Array(12).fill(0),
                        borderColor: '#a855f7',
                        backgroundColor: gradientMeeting,
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 4,
                        pointBackgroundColor: '#a855f7',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2,
                        pointHoverRadius: 6,
                        borderDash: [3, 3]
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
                        callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} ${ctx.dataset.label.toLowerCase().includes('task') ? 'tasks' : ''}` }
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
    // 10. PROFILE DROPDOWN & SETTINGS MODAL
    // =============================================

    // Initialize profile with user info
    function initProfile() {
        const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
        const email = session.email || '';
        const name = email.split('@')[0]
            .replace(/[._]/g, ' ')
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        const initial = (session.email || 'U')[0].toUpperCase();
        const avatar = document.getElementById('profileAvatar');
        if (avatar) avatar.innerHTML = '<span style="font-weight:700;font-size:0.9rem;">' + initial + '</span>';
        const nameEl = document.getElementById('profileUserName');
        if (nameEl) nameEl.textContent = name;
        const roleEl = document.getElementById('profileUserRole');
        if (roleEl) {
            const roleLabels = { admin: 'Admin', rbh: 'RBH', rcl: 'RCL', bh: 'BH', cl: 'CL' };
            roleEl.textContent = roleLabels[session.role] || session.role || '';
        }
        const dropdownName = document.getElementById('dropdownUserName');
        if (dropdownName) dropdownName.textContent = name;
        const dropdownEmail = document.getElementById('dropdownUserEmail');
        if (dropdownEmail) dropdownEmail.textContent = email;
        
        // Store for settings modal
        window._session = session;
        window._sessionEmail = email;
    }
    initProfile();

    const profileBtn = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = profileDropdown.style.display === 'block';
            profileDropdown.style.display = isVisible ? 'none' : 'block';
        });
        document.addEventListener('click', () => {
            profileDropdown.style.display = 'none';
        });
        profileDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    // Settings Modal
    const settingsModal = document.getElementById('settingsModal');
    function openSettingsModal() {
        settingsModal.classList.add('active');
        settingsModal.style.display = 'flex';
        // Fill user info
        const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
        const name = (session.email || '').split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        document.getElementById('settingsAvatar').textContent = (session.email || 'U')[0].toUpperCase();
        document.getElementById('settingsUserName').textContent = name;
        document.getElementById('settingsUserEmail').textContent = session.email || '';
    }
    function closeSettingsModal() {
        settingsModal.classList.remove('active');
        settingsModal.style.display = 'none';
        document.getElementById('settingsNewPassword').value = '';
        document.getElementById('settingsConfirmPassword').value = '';
        document.getElementById('settingsError').textContent = '';
        document.getElementById('settingsStrengthFill').style.width = '0%';
        document.getElementById('settingsStrengthText').textContent = '';
        document.getElementById('settingsConfirmStatus').textContent = '';
    }

    document.getElementById('dropdownSettings')?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.style.display = 'none';
        openSettingsModal();
    });

    document.getElementById('settingsModalClose')?.addEventListener('click', closeSettingsModal);
    settingsModal?.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsModal(); });

    // Settings: password strength & confirm
    document.getElementById('settingsNewPassword')?.addEventListener('input', function() {
        const strength = getPasswordStrength(this.value);
        const fill = document.getElementById('settingsStrengthFill');
        const text = document.getElementById('settingsStrengthText');
        const colors = ['#ef4444','#f59e0b','#22c55e','#3b82f6'];
        fill.style.width = (strength.score * 25) + '%';
        fill.style.background = colors[strength.score - 1] || colors[0];
        text.textContent = strength.label;
        text.style.color = colors[strength.score - 1] || colors[0];
        checkSettingsPasswords();
    });
    document.getElementById('settingsConfirmPassword')?.addEventListener('input', checkSettingsPasswords);

    function checkSettingsPasswords() {
        const pwd = document.getElementById('settingsNewPassword').value;
        const confirm = document.getElementById('settingsConfirmPassword').value;
        const status = document.getElementById('settingsConfirmStatus');
        if (!confirm) { status.textContent = ''; status.style.color = ''; return; }
        if (pwd === confirm) {
            status.innerHTML = '<i class="fas fa-check-circle" style="color:#22c55e;font-size:1rem;"></i>';
        } else {
            status.innerHTML = '<i class="fas fa-times-circle" style="color:#ef4444;font-size:1rem;"></i>';
        }
    }

    // Settings: change password
    document.getElementById('settingsChangeBtn')?.addEventListener('click', async function() {
        const btn = this;
        const newPassword = document.getElementById('settingsNewPassword').value;
        const confirmPassword = document.getElementById('settingsConfirmPassword').value;
        const errorEl = document.getElementById('settingsError');

        if (!newPassword || !confirmPassword) {
            errorEl.textContent = 'Please enter and confirm your new password.';
            return;
        }
        if (newPassword !== confirmPassword) {
            errorEl.textContent = 'Passwords do not match.';
            return;
        }
        if (newPassword.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters.';
            return;
        }

        errorEl.textContent = '';
        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loader').style.display = 'inline';
        btn.disabled = true;

        try {
            const result = await changeUserPassword(window._sessionEmail, newPassword);
            if (result && result.success) {
                showToast('Password updated successfully!', 'success');
                closeSettingsModal();
                // Update session
                const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
                session.isDefaultPassword = false;
                localStorage.setItem('cadence-session', JSON.stringify(session));
                window._session = session;
            } else {
                errorEl.textContent = (result && result.error) || 'Failed to update password.';
            }
        } catch (err) {
            errorEl.textContent = err.message || 'Error updating password.';
        } finally {
            btn.querySelector('.btn-text').style.display = 'inline';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;
        }
    });

    // Settings: logout
    document.getElementById('settingsLogoutBtn')?.addEventListener('click', () => {
        localStorage.removeItem('cadence-session');
        window.location.href = 'login.html';
    });
    document.getElementById('dropdownLogout')?.addEventListener('click', () => {
        localStorage.removeItem('cadence-session');
        window.location.href = 'login.html';
    });

    // Password strength helper
    function getPasswordStrength(password) {
        let score = 1;
        if (password.length >= 6) score = 2;
        if (password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password)) score = 3;
        if (password.length >= 10 && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score = 4;
        const labels = { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' };
        return { score, label: labels[score] || 'Weak' };
    }

    // =============================================
    // 11. EVENT LISTENERS
    // =============================================

    // Filter cascade: when upper filter changes, pass which one changed
    document.getElementById('filterRegion').addEventListener('change', () => {
        console.log('[FILTER] Region changed to:', document.getElementById('filterRegion').value);
        onFilterChange('region');
    });
    document.getElementById('filterBH').addEventListener('change', () => {
        console.log('[FILTER] BH changed to:', document.getElementById('filterBH').value);
        onFilterChange('bh');
    });
    document.getElementById('filterRCL').addEventListener('change', () => {
        console.log('[FILTER] RCL changed to:', document.getElementById('filterRCL').value);
        onFilterChange('rcl');
    });
    document.getElementById('filterCenter').addEventListener('change', () => {
        console.log('[FILTER] Center changed to:', document.getElementById('filterCenter').value);
        onFilterChange('center');
    });

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
    const qaMsgs = { newReportBtn: 'Opening Report Builder...', exportBtn: 'Generating PDF...', shareBtn: 'Link copied!', scheduleBtn: 'Opening scheduler...' };
    Object.entries(qaMsgs).forEach(([id, msg]) => {
        document.getElementById(id)?.addEventListener('click', () => { showToast(msg, 'info'); });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal-overlay.active');
            modals.forEach(m => { m.classList.remove('active'); m.style.display = 'none'; });
        }
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
    initOverviewUserSelect();
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
        // Force reflow then add active class so opacity transitions to 1
        void modal.offsetHeight;
        modal.classList.add('active');

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

// ===============================================
// COUNSELLING SUMMARY — hierarchy-aware per-user metrics
// ===============================================

const SUMMARY_CONFIG = {
    WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbyCL_Sh0wjtmSLy1aun02yuVD1TljUE65lty3aJKcFFgx_G8NMvDPA6NUiVL43B-HRA/exec',
    DAILY_AUDIT_TARGET: 1,
    WEEKLY_AUDIT_TARGET: 5,
    DAILY_MEETING_TARGET: 1,
    WEEKLY_MEETING_TARGET: 5
};

document.addEventListener('DOMContentLoaded', () => setTimeout(initCounsellingSummary, 1500));
if (document.readyState !== 'loading') setTimeout(initCounsellingSummary, 1500);

async function initCounsellingSummary() {
    if (window.__summaryInitDone) return;
    window.__summaryInitDone = true;
    if (!document.getElementById('counsellingSummary')) return;

    const now = new Date();
    document.getElementById('summaryFromDate').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    document.getElementById('summaryToDate').value = now.toISOString().split('T')[0];

    await loadSummaryData();

    document.getElementById('summaryFilterBtn')?.addEventListener('click', loadSummaryData);
    document.getElementById('summaryRefreshBtn')?.addEventListener('click', loadSummaryData);
}

async function loadSummaryData() {
    const els = {
        loading: document.getElementById('summaryLoading'),
        error: document.getElementById('summaryError'),
        errorMsg: document.getElementById('summaryErrorMsg'),
        tableWrap: document.getElementById('summaryTableWrap'),
        empty: document.getElementById('summaryEmpty'),
        tbody: document.getElementById('summaryBody')
    };

    els.loading.style.display = 'block';
    els.error.style.display = 'none';
    els.tableWrap.style.display = 'none';
    els.empty.style.display = 'none';

    try {
        // 1) Fetch form responses from web app
        const resp = await fetch(SUMMARY_CONFIG.WEBAPP_URL + '?action=responses', { method: 'GET', mode: 'cors' });
        if (!resp.ok) throw new Error('Web app HTTP ' + resp.status);
        const result = await resp.json();
        if (!result.success) throw new Error(result.error || 'Web app failed');
        const rows = result.data || [];

        // 2) Fetch sheet data for role + hierarchy
        let sheetRows = [];
        try { sheetRows = await fetchSheetData(); } catch (e) { console.warn('Sheet fetch for summary failed', e); }

        // 3) Get logged-in session
        const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
        const sessionEmail = (session.email || '').toLowerCase().trim();

        // 4) Build role map + hierarchy info
        const { roleMap, bhOfUser, rclOfUser, rbhOfUser } = buildSummaryHierarchy(sheetRows);
        
        // Give session user a role in roleMap if missing
        if (sessionEmail && session.role && !roleMap[sessionEmail]) {
            roleMap[sessionEmail] = session.role;
        }

        // 5) Determine visible users based on role
        const visibleEmails = getSummaryVisibleEmails(sessionEmail, roleMap, bhOfUser, rclOfUser, rbhOfUser, session.role);

        // 6) Get date filter
        const fromDate = document.getElementById('summaryFromDate').value;
        const toDate = document.getElementById('summaryToDate').value;

        // 7) Process & filter
        const summary = processResponses(rows, roleMap, fromDate, toDate, visibleEmails);

        els.loading.style.display = 'none';
        if (summary.length === 0) { els.empty.style.display = 'block'; return; }

        renderSummaryTable(els.tbody, summary);
        els.tableWrap.style.display = 'block';

        // Kick off Recent Activity & Overview Charts with same data
        initRecentAndCharts(rows, roleMap);

    } catch (err) {
        console.error('Summary error:', err);
        els.loading.style.display = 'none';
        els.error.style.display = 'block';
        els.errorMsg.textContent = err.message || 'Failed to load summary. Deploy the updated web app first.';
    }
}

function buildSummaryHierarchy(sheetRows) {
    const roleMap = {};
    const hierarchyRoles = {};
    const bhOfUser = {};
    const rclOfUser = {};
    const rbhOfUser = {};

    sheetRows.forEach(row => {
        const email = (row.mail_id || '').toLowerCase().trim();
        const bh = (row.BH || '').toLowerCase().trim();
        const rcl = (row.RCL || '').toLowerCase().trim();
        const rbh = (row.RBH || '').toLowerCase().trim();
        const empType = (row.employee_type || 'CL').toUpperCase();

        if (email) roleMap[email] = empType === 'CM' ? 'CL' : empType;

        // Track hierarchy-only users
        if (bh && bh !== '-' && !roleMap[bh]) hierarchyRoles[bh] = 'BH';
        if (rcl && rcl !== '-' && !roleMap[rcl]) hierarchyRoles[rcl] = 'RCL';
        if (rbh && rbh !== '-' && !roleMap[rbh]) hierarchyRoles[rbh] = 'RBH';

        // Always record hierarchy relationships, even for hierarchy-only users
        // e.g. if user X has BH=akanksha, also record akanksha's RBH/RCL
        if (bh && bh !== '-') {
            bhOfUser[email] = bhOfUser[email] || new Set(); bhOfUser[email].add(bh);
            // Track hierarchy for BH user too
            if (rcl && rcl !== '-') { rclOfUser[bh] = rclOfUser[bh] || new Set(); rclOfUser[bh].add(rcl); }
            if (rbh && rbh !== '-') { rbhOfUser[bh] = rbhOfUser[bh] || new Set(); rbhOfUser[bh].add(rbh); }
        }
        if (rcl && rcl !== '-') {
            rclOfUser[email] = rclOfUser[email] || new Set(); rclOfUser[email].add(rcl);
            if (rbh && rbh !== '-') { rbhOfUser[rcl] = rbhOfUser[rcl] || new Set(); rbhOfUser[rcl].add(rbh); }
        }
        if (rbh && rbh !== '-') {
            rbhOfUser[email] = rbhOfUser[email] || new Set(); rbhOfUser[email].add(rbh);
        }
    });

    Object.entries(hierarchyRoles).forEach(([email, role]) => { if (!roleMap[email]) roleMap[email] = role; });
    return { roleMap, bhOfUser, rclOfUser, rbhOfUser };
}

function getSummaryVisibleEmails(sessionEmail, roleMap, bhOfUser, rclOfUser, rbhOfUser, sessionRole) {
    const role = (sessionRole || roleMap[sessionEmail] || 'CL').toUpperCase();
    const allEmails = Object.keys(roleMap);
    const visible = new Set();

    if (role === 'ADMIN' || role === 'ADMINISTRATOR') { allEmails.forEach(e => visible.add(e)); return visible; }

    if (role === 'RBH') {
        // Users whose RBH is this RBH
        allEmails.forEach(e => { if (rbhOfUser[e]?.has(sessionEmail)) visible.add(e); });
        // Also BHs managed by this RBH
        allEmails.forEach(e => {
            const bhs = bhOfUser[e];
            if (bhs) bhs.forEach(bh => { if (rbhOfUser[bh]?.has(sessionEmail)) visible.add(e); });
        });
        visible.add(sessionEmail);
        return visible;
    }

    if (role === 'RCL') {
        allEmails.forEach(e => { if (rclOfUser[e]?.has(sessionEmail)) visible.add(e); });
        visible.add(sessionEmail);
        return visible;
    }

    if (role === 'BH') {
        allEmails.forEach(e => { if (bhOfUser[e]?.has(sessionEmail)) visible.add(e); });
        visible.add(sessionEmail);
        return visible;
    }

    // CL or unknown: only themselves
    if (sessionEmail) visible.add(sessionEmail);
    return visible;
}

function processResponses(rows, roleMap, fromDate, toDate, visibleEmails) {
    const userStats = {};

    rows.forEach(row => {
        const formType = row['Form Type'] || '';
        let email = (row['Submitted By'] || '').toLowerCase().trim();
        if (!email || !visibleEmails.has(email)) return;

        let dateStr = '';
        if (formType === 'Audits') dateStr = row['Audit Date'] || '';
        else if (formType === '1-1 & Training') dateStr = row['Meeting Date'] || '';

        const rowDate = parseDateFlexible(dateStr);
        if (!rowDate) return;

        if (fromDate && rowDate < new Date(fromDate + 'T00:00:00')) return;
        if (toDate && rowDate > new Date(toDate + 'T23:59:59')) return;

        if (!userStats[email]) userStats[email] = { email, audits: 0, meetings: 0, dates: new Set() };
        const s = userStats[email];
        if (formType === 'Audits') s.audits++;
        else if (formType === '1-1 & Training') s.meetings++;
        s.dates.add(rowDate.toISOString().split('T')[0]);
    });

    const result = Object.values(userStats).map(s => {
        const days = Math.max(1, s.dates.size);
        const weeks = Math.max(1, Math.ceil(days / 7));
        return {
            email: s.email,
            role: roleMap[s.email] || 'CL',
            noOfAudits: s.audits,
            auditsDailyAvg: +((s.audits / days).toFixed(1)),
            auditDayStatus: getStatus(s.audits / days, SUMMARY_CONFIG.DAILY_AUDIT_TARGET),
            auditsWeeklyAvg: +((s.audits / weeks).toFixed(1)),
            auditWeekStatus: getStatus(s.audits / weeks, SUMMARY_CONFIG.WEEKLY_AUDIT_TARGET),
            noOfMeetings: s.meetings,
            meetingsDailyAvg: +((s.meetings / days).toFixed(1)),
            meetingDayStatus: getStatus(s.meetings / days, SUMMARY_CONFIG.DAILY_MEETING_TARGET),
            meetingsWeeklyAvg: +((s.meetings / weeks).toFixed(1)),
            meetingWeekStatus: getStatus(s.meetings / weeks, SUMMARY_CONFIG.WEEKLY_MEETING_TARGET)
        };
    });

    result.sort((a, b) => b.noOfAudits - a.noOfAudits || b.noOfMeetings - a.noOfMeetings);
    return result;
}

function parseDateFlexible(str) {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length === 3 && parts[2].length === 4) {
        const d = new Date(parts[2], parts[1] - 1, parts[0]);
        if (!isNaN(d)) return d;
    }
    const d = new Date(str);
    return isNaN(d) ? null : d;
}

function getStatus(avg, target) {
    if (avg >= target) return 'On Track';
    if (avg >= target * 0.5) return 'Need Attention';
    return 'Behind';
}

function renderSummaryTable(tbody, data) {
    tbody.innerHTML = '';
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        const badge = s => {
            const c = s === 'On Track' ? '#22c55e' : s === 'Need Attention' ? '#f59e0b' : '#ef4444';
            return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:600;background:${c}18;color:${c};"><span style="width:6px;height:6px;border-radius:50%;background:${c};"></span>${s}</span>`;
        };
        tr.innerHTML = `
            <td style="padding:10px 12px;font-weight:500;color:var(--text-primary);">${escHtml(row.email)}</td>
            <td style="padding:10px 12px;"><span style="padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:600;background:var(--accent-blue)15;color:var(--accent-blue);">${escHtml(row.role)}</span></td>
            <td class="summary-num">${row.noOfAudits}</td>
            <td class="summary-num">${row.auditsDailyAvg}</td>
            <td style="padding:10px 12px;text-align:center;">${badge(row.auditDayStatus)}</td>
            <td class="summary-num">${row.auditsWeeklyAvg}</td>
            <td style="padding:10px 12px;text-align:center;">${badge(row.auditWeekStatus)}</td>
            <td class="summary-num">${row.noOfMeetings}</td>
            <td class="summary-num">${row.meetingsDailyAvg}</td>
            <td style="padding:10px 12px;text-align:center;">${badge(row.meetingDayStatus)}</td>
            <td class="summary-num">${row.meetingsWeeklyAvg}</td>
            <td style="padding:10px 12px;text-align:center;">${badge(row.meetingWeekStatus)}</td>`;
        tbody.appendChild(tr);
    });
}

function escHtml(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }

// ===============================================
// RECENT ACTIVITY & OVERVIEW CHARTS
// ===============================================

let _chartAudit = null, _chartMeeting = null;
let _overviewFormRows = [];
let _overviewRoleMap = {};

function initRecentAndCharts(formRows, roleMap) {
    if (window.__recentChartsDone) return;
    window.__recentChartsDone = true;

    _overviewFormRows = formRows || [];
    _overviewRoleMap = roleMap || {};

    const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
    if (session.email && !_overviewRoleMap[session.email]) {
        _overviewRoleMap[session.email] = session.role || 'CL';
    }

    // Recent Activity (filtered by visible users)
    loadRecentActivity(_overviewFormRows, _overviewRoleMap);
}

// ============ RECENT ACTIVITY ============

function loadRecentActivity(rows, roleMap) {
    const list = document.getElementById('activityList');
    const countEl = document.getElementById('activityCount');
    if (!list) return;

    // Filter today's entries (by submission time)
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEntries = rows.filter(r => {
        const submittedAt = r['Submitted At'];
        if (!submittedAt) return false;
        const d = new Date(submittedAt);
        return !isNaN(d) && d.toISOString().split('T')[0] === todayStr;
    }).sort((a, b) => {
        const tA = new Date(a['Submitted At'] || 0).getTime();
        const tB = new Date(b['Submitted At'] || 0).getTime();
        return tB - tA; // newest first
    });

    if (countEl) countEl.textContent = todayEntries.length + ' today';

    if (todayEntries.length === 0) {
        list.innerHTML = `<li class="activity-item" style="text-align:center;padding:20px;color:var(--text-muted);">
            <i class="fas fa-inbox" style="font-size:1.2rem;margin-bottom:6px;display:block;"></i>
            No activity today
        </li>`;
        return;
    }

    list.innerHTML = todayEntries.slice(0, 10).map(row => {
        const email = (row['Submitted By'] || '').toLowerCase().trim();
        const formType = row['Form Type'] || '';
        const submittedAt = row['Submitted At'];
        const timeAgo = getTimeAgo(new Date(submittedAt));
        const role = roleMap[email] || '';
        const initials = (email.charAt(0) || '?').toUpperCase();
        const colors = ['#3b82f6','#a855f7','#22c55e','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'];
        const colorIdx = email.split('').reduce((a,c) => a + c.charCodeAt(0), 0) % colors.length;
        const icon = formType === 'Audits' ? 'fa-clipboard-check' : 'fa-handshake';
        const iconBg = formType === 'Audits' ? 'blue' : 'purple';
        const label = formType === 'Audits' ? 'submitted an Audit' : 'completed a 1-1 Meeting';
        const center = row['Center (Audit)'] || row['Center (1-1)'] || '';

        return `<li class="activity-item">
            <div class="activity-avatar" style="width:36px;height:36px;border-radius:50%;background:${colors[colorIdx]}20;color:${colors[colorIdx]};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;flex-shrink:0;">${initials}</div>
            <div class="activity-info">
                <p><strong>${escHtml(email)}</strong> ${label} ${center ? 'at <em>' + escHtml(center) + '</em>' : ''}</p>
                <span class="activity-time">${timeAgo}</span>
            </div>
        </li>`;
    }).join('');
}

function getTimeAgo(date) {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
}


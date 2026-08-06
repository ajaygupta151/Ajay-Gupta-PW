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

    // ========== THEME (from Settings > Appearance) ==========
    const savedTheme = localStorage.getItem('cadence-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

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

    // Region id → name map (module-level access for the overview chart)
    window._regionById = {};
    (orgData.regions || []).forEach(r => { window._regionById[r.id] = r.name; });

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
                const empTypeRaw = (row.employee_type || 'CL').toUpperCase();
                allUsers[email] = {
                    email: email,
                    name: email.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    // Display-level role only — the Sheet2 'role' column is the
                    // single source of truth for login/admin access (users.js).
                    role: empTypeRaw === 'CM' ? 'cl' : empTypeRaw.toLowerCase(),
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

        // ---- ADMIN OVERRIDE (mirrors users.js) ----
        if (typeof ADMIN_EMAILS !== 'undefined') {
            ADMIN_EMAILS.forEach(email => {
                const normalized = email.toLowerCase().trim();
                if (!normalized || !allUsers[normalized]) return;
                allUsers[normalized].role = 'admin';
            });
        }

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
            // CL: own center only (session stores center name, resolve to center id)
            const ownCenter = findCenterByCLOrName(user.email, user.center);
            allowedCenters = ownCenter ? [ownCenter.id] : (user.center ? [user.center] : []);
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
        // CL: only own center (resolve session center name to center id)
        if (role.level <= 1) {
            const c = findCenterByCLOrName(user.email, user.center);
            const centerId = c ? c.id : user.center;
            sel.innerHTML += `<option value="${centerId}">${c ? c.name : user.center}</option>`;
            console.log(`[CASCADE] populateCenterFilter: CL role, added own center '${centerId}'`);
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

    // Helper: resolve a CL's center. Session stores the center NAME (from sheet),
    // but org-data center ids are the CL's email. Match by email first, name as fallback.
    function findCenterByCLOrName(clEmail, centerName) {
        for (const region of orgData.regions) {
            for (const bh of region.bhs) {
                for (const c of bh.centers) {
                    if (c.id === clEmail) return c;
                }
            }
        }
        if (centerName) {
            for (const region of orgData.regions) {
                for (const bh of region.bhs) {
                    for (const c of bh.centers) {
                        if (c.name === centerName) return c;
                    }
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
            const ownCenter = findCenterByCLOrName(user.email, user.center);
            centerSel.value = ownCenter ? ownCenter.id : user.center;
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

        // Update Chart (3-line overview: region total / me / selected person)
        updateOverviewChart();

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

    let lastCenters = [];
    let maxOpenDepth = 2; // default expansion depth for the team tree (set per role in updateTeamList)

    function updateTeamList(centers) {
        const container = document.getElementById('teamList');
        if (!container) return;

        // Cache latest centers so the tree can be re-rendered when form data arrives
        lastCenters = centers;
        window.refreshTeamList = () => updateTeamList(lastCenters);

        // Default expansion: only one level below the current user's own level.
        // Tree depth: RBH=1, BH/RCL=2, CL=3. Own level from role (cl=1..admin=5)
        //   admin -> open RBH; rbh -> open BH+RCL; rcl/bh -> open CL; cl -> whole path open
        const role = ROLES[currentRole];
        maxOpenDepth = role ? 6 - role.level : 2;

        // ---- Build org hierarchy tree from visible centers ----
        // Structure: RBH -> { BH -> [CLs] , RCL -> [CLs] }
        // (CL appears under its BH AND under its RCL, per requirement)
        const tree = {};

        centers.forEach(c => {
            const clEmail = c.cl;
            if (!clEmail) return;
            const clUser = orgData.users ? orgData.users[clEmail] : null;
            // Clean helper: '-' means empty in this sheet data
            const clean = v => (v && v !== '-' ? v : '');
            const rbhEmail = clean(clUser && clUser.rbh);
            const rclEmail = clean(c.rcl) || clean(clUser && clUser.rcl);
            const bhEmail = clean(c.bhId) || clean(clUser && clUser.bh);

            const clNode = {
                email: clEmail,
                name: (clUser && clUser.name) || clEmail,
                center: c.name,
                tasks: c.tasks || { total: 0, completed: 0 }
            };

            const rbhKey = rbhEmail || rclEmail || bhEmail || 'Unassigned';
            if (!tree[rbhKey]) tree[rbhKey] = { email: rbhKey, bhs: {}, rcls: {} };

            // Under BH
            if (bhEmail) {
                if (!tree[rbhKey].bhs[bhEmail]) {
                    tree[rbhKey].bhs[bhEmail] = {
                        email: bhEmail,
                        name: (orgData.users && orgData.users[bhEmail] && orgData.users[bhEmail].name) || bhEmail,
                        cls: {}
                    };
                }
                tree[rbhKey].bhs[bhEmail].cls[clEmail] = clNode;
            }

            // Under RCL
            if (rclEmail) {
                if (!tree[rbhKey].rcls[rclEmail]) {
                    tree[rbhKey].rcls[rclEmail] = {
                        email: rclEmail,
                        name: (orgData.users && orgData.users[rclEmail] && orgData.users[rclEmail].name) || rclEmail,
                        cls: {}
                    };
                }
                tree[rbhKey].rcls[rclEmail].cls[clEmail] = clNode;
            }
        });

        const rbhKeys = Object.keys(tree).sort((a, b) =>
            ((orgData.users && orgData.users[tree[a].email] && orgData.users[tree[a].email].name) || tree[a].email)
                .localeCompare((orgData.users && orgData.users[tree[b].email] && orgData.users[tree[b].email].name) || tree[b].email));

        if (rbhKeys.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No team members found for current filters.</p>';
            return;
        }

        // ---- Render ----
        let html = '<div class="org-tree">';

        rbhKeys.forEach(rbhKey => {
            const rbh = tree[rbhKey];
            const bhKeys = Object.keys(rbh.bhs).sort((a, b) => (rbh.bhs[a].name || '').localeCompare(rbh.bhs[b].name || ''));
            const rclKeys = Object.keys(rbh.rcls).sort((a, b) => (rbh.rcls[a].name || '').localeCompare(rbh.rcls[b].name || ''));

            // Unique CLs across the whole RBH subtree
            const allCls = new Set();
            bhKeys.forEach(k => Object.keys(rbh.bhs[k].cls).forEach(e => allCls.add(e)));
            rclKeys.forEach(k => Object.keys(rbh.rcls[k].cls).forEach(e => allCls.add(e)));

            const childrenHtml = [
                bhKeys.map(bhk => {
                    const bh = rbh.bhs[bhk];
                    const clsHtml = Object.values(bh.cls)
                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                        .map(renderTreeLeaf)
                        .join('');
                    return renderTreeNode(bh.name, 'BH', Object.keys(bh.cls).length, clsHtml, bh.email, 2, collectSubtreeEmails(bh));
                }).join(''),
                rclKeys.map(rclk => {
                    const rcl = rbh.rcls[rclk];
                    const clsHtml = Object.values(rcl.cls)
                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                        .map(renderTreeLeaf)
                        .join('');
                    return renderTreeNode(rcl.name, 'RCL', Object.keys(rcl.cls).length, clsHtml, rcl.email, 2, collectSubtreeEmails(rcl));
                }).join('')
            ].join('');

            html += renderTreeNode(
                (orgData.users && orgData.users[rbh.email] && orgData.users[rbh.email].name) || (rbh.email === 'Unassigned' ? 'Unassigned' : rbh.email),
                'RBH',
                allCls.size,
                childrenHtml,
                rbh.email === 'Unassigned' ? '' : rbh.email,
                1,
                collectSubtreeEmails(rbh)
            );
        });

        html += '</div>';
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

    // Collect every email in a node's subtree (node + all descendants)
    function collectSubtreeEmails(node) {
        const set = new Set();
        (function walk(n) {
            if (!n) return;
            if (n.email) set.add(n.email.toLowerCase());
            if (n.cls) Object.values(n.cls).forEach(c => walk(c));
            if (n.bhs) Object.values(n.bhs).forEach(b => walk(b));
            if (n.rcls) Object.values(n.rcls).forEach(r => walk(r));
        })(node);
        return set;
    }

    // Aggregate form fill stats for a set of team emails
    function getTeamStats(emailSet) {
        let audits = 0, meetings = 0;
        emailSet.forEach(e => {
            const fc = _formCountByEmail[e];
            if (fc) { audits += fc.audits; meetings += fc.meetings; }
        });
        return { team: emailSet.size, total: audits + meetings, audits, meetings };
    }

    function initialsOf(name) {
        return (name || '?').split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }

    // Render a team-member card (RBH / BH / RCL) with full stats:
    // team size (people working under them) + forms filled by the team,
    // split into audits and 1-1 meetings.
    function renderTreeNode(name, role, count, childrenHtml, email, depth, subtreeEmails) {
        const stats = getTeamStats(subtreeEmails);
        const underCount = stats.team - 1; // people under them (self excluded)
        const collapsed = depth >= maxOpenDepth ? ' collapsed' : '';
        const hasChildren = !!childrenHtml;
        return `
            <div class="tree-node${collapsed}">
                <div class="tree-card${hasChildren ? ' clickable' : ''}" onclick="${hasChildren ? "this.parentElement.classList.toggle('collapsed')" : ''}">
                    <div class="tree-card-head">
                        ${hasChildren ? '<span class="tree-chevron"><i class="fas fa-chevron-down"></i></span>' : '<span class="tree-chevron ph"></span>'}
                        <span class="tree-avatar">${initialsOf(name)}</span>
                        <span class="tree-role-badge role-${role.toLowerCase()}">${role}</span>
                        <span class="tree-name" title="${escHtml(name)}">${escHtml(name)}</span>
                    </div>
                    <div class="tree-card-stats">
                        <div class="stat stat-team" title="People working under ${escHtml(name)}"><i class="fas fa-user-friends"></i><b>${underCount}</b><span>Team</span></div>
                        <div class="stat stat-forms" title="Total forms filled by the team"><i class="fas fa-clipboard-check"></i><b>${stats.total}</b><span>Forms</span></div>
                        <div class="stat stat-audits" title="Audits filled by the team"><i class="fas fa-clipboard-list"></i><b>${stats.audits}</b><span>Audits</span></div>
                        <div class="stat stat-meetings" title="1-1 meetings filled by the team"><i class="fas fa-handshake"></i><b>${stats.meetings}</b><span>1-1</span></div>
                    </div>
                </div>
                ${childrenHtml ? `<div class="tree-children">${childrenHtml}</div>` : ''}
            </div>`;
    }

    // Render a CL leaf as a card (their own form fill stats)
    function renderTreeLeaf(cl) {
        const fc = _formCountByEmail[(cl.email || '').toLowerCase()] || { total: 0, audits: 0, meetings: 0 };
        const pct = cl.tasks.total > 0 ? Math.round((cl.tasks.completed / cl.tasks.total) * 100) : 0;
        return `
            <div class="tree-node">
                <div class="tree-card leaf">
                    <div class="tree-card-head">
                        <span class="tree-avatar">${initialsOf(cl.name)}</span>
                        <span class="tree-role-badge role-cl">CL</span>
                        <span class="tree-name" title="${escHtml(cl.name)}">${escHtml(cl.name)}</span>
                        <span class="tree-leaf-center"><i class="fas fa-map-marker-alt"></i> ${escHtml(cl.center)}</span>
                    </div>
                    <div class="tree-card-stats">
                        <div class="stat stat-team" title="People working under ${escHtml(cl.name)}"><i class="fas fa-user-friends"></i><b>0</b><span>Team</span></div>
                        <div class="stat stat-forms" title="Forms filled by ${escHtml(cl.name)}"><i class="fas fa-clipboard-check"></i><b>${fc.total}</b><span>Forms</span></div>
                        <div class="stat stat-audits" title="Audits filled by ${escHtml(cl.name)}"><i class="fas fa-clipboard-list"></i><b>${fc.audits}</b><span>Audits</span></div>
                        <div class="stat stat-meetings" title="1-1 meetings filled by ${escHtml(cl.name)}"><i class="fas fa-handshake"></i><b>${fc.meetings}</b><span>1-1</span></div>
                    </div>
                </div>
            </div>`;
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
        gradientBlue.addColorStop(0, 'rgba(20, 184, 166, 0.3)');
        gradientBlue.addColorStop(1, 'rgba(20, 184, 166, 0.0)');

        const gradientGreen = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradientGreen.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
        gradientGreen.addColorStop(1, 'rgba(34, 197, 94, 0.0)');

        const gradientViolet = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradientViolet.addColorStop(0, 'rgba(255, 45, 45, 0.28)');
        gradientViolet.addColorStop(1, 'rgba(255, 45, 45, 0.0)');

        const gradientAudit = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradientAudit.addColorStop(0, 'rgba(255, 45, 45, 0.2)');
        gradientAudit.addColorStop(1, 'rgba(255, 45, 45, 0.0)');

        const gradientMeeting = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradientMeeting.addColorStop(0, 'rgba(255, 138, 61, 0.2)');
        gradientMeeting.addColorStop(1, 'rgba(255, 138, 61, 0.0)');

        cadenceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [
                    // 1) Region Audits (filled)
                    {
                        label: 'Region Audits',
                        data: new Array(12).fill(0),
                        borderColor: '#FF2D2D',
                        backgroundColor: gradientAudit,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: '#FF2D2D',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2,
                        pointHoverRadius: 7
                    },
                    // 2) Region 1-1 & Training (filled)
                    {
                        label: 'Region 1-1 & Training',
                        data: new Array(12).fill(0),
                        borderColor: '#FF8A3D',
                        backgroundColor: gradientMeeting,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: '#FF8A3D',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2,
                        pointHoverRadius: 7
                    },
                    // 3) Logged-in user's forms
                    {
                        label: 'Me',
                        data: new Array(12).fill(0),
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
                    // 4) Selected BH / RCL / CL (shown only when a person filter is set)
                    {
                        label: 'Selected BH/RCL/CL',
                        data: new Array(12).fill(0),
                        borderColor: '#14b8a6',
                        backgroundColor: gradientBlue,
                        fill: false,
                        tension: 0.3,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: '#14b8a6',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2,
                        pointHoverRadius: 7,
                        borderDash: [6, 4],
                        hidden: true
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
                        callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}` }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(51,65,85,0.3)', drawBorder: false }, ticks: { color: '#64748b', font: { size: 11, family: 'Inter' } } },
                    y: { grid: { color: 'rgba(51,65,85,0.3)', drawBorder: false }, ticks: { color: '#64748b', font: { size: 11, family: 'Inter' }, precision: 0 }, beginAtZero: true }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });

        // Expose chart instance for module-level overview updates
        window.cadenceChart = cadenceChart;
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

    document.getElementById('dropdownSettings')?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.style.display = 'none';
        window.location.href = 'settings.html';
    });

    // Settings: logout
    document.getElementById('dropdownLogout')?.addEventListener('click', () => {
        localStorage.removeItem('cadence-session');
        window.location.href = 'login.html';
    });

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
        updateOverviewChart();
    });

    // Chart form-type (Both / Audits / 1-1)
    document.getElementById('chartType')?.addEventListener('change', () => {
        updateOverviewChart();
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

    function showForcePasswordModal() {} // (removed — no forced password-change nagging)

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

// Per-person form fill counts: email -> { total, audits, meetings }
let _formCountByEmail = {};

function buildFormCountMap(rows) {
    const map = {};
    (rows || []).forEach(r => {
        const email = (r['Submitted By'] || '').toLowerCase().trim();
        if (!email) return;
        const type = r['Form Type'] || '';
        if (!map[email]) map[email] = { total: 0, audits: 0, meetings: 0 };
        map[email].total++;
        if (type === 'Audits') map[email].audits++;
        else map[email].meetings++;
    });
    _formCountByEmail = map;
    return map;
}

function initRecentAndCharts(formRows, roleMap) {
    if (window.__recentChartsDone) return;
    window.__recentChartsDone = true;

    _overviewFormRows = formRows || [];
    _overviewRoleMap = roleMap || {};

    const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
    if (session.email && !_overviewRoleMap[session.email]) {
        _overviewRoleMap[session.email] = session.role || 'CL';
    }

    // Per-person form counts for the Team Performance tree
    buildFormCountMap(_overviewFormRows);

    // Recent Activity (filtered by visible users)
    loadRecentActivity(_overviewFormRows, _overviewRoleMap);

    // Cadence Overview 3-line chart (region total / me / selected person)
    updateOverviewChart();

    // Re-render team tree now that form counts are available
    if (window.refreshTeamList) window.refreshTeamList();
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

// ===============================================
// CADENCE OVERVIEW — 3-line chart
//   1) Region Total (all Audits + 1-1 forms in the selected region)
//   2) Me (logged-in user's forms in that region)
//   3) Selected BH/RCL/CL (forms by the person chosen in filters)
// ===============================================

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getPeriodBuckets(period) {
    const now = new Date();
    const starts = [];
    const labels = [];

    if (period === 'weekly') {
        // Last 8 weeks, weeks starting Monday
        const dow = (now.getDay() + 6) % 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - dow);
        for (let i = 7; i >= 0; i--) {
            const s = new Date(monday);
            s.setDate(monday.getDate() - i * 7);
            starts.push(+s);
            labels.push(s.getDate() + ' ' + MONTH_NAMES[s.getMonth()]);
        }
    } else if (period === 'quarterly') {
        // Last 4 quarters
        const curQ = Math.floor(now.getMonth() / 3);
        for (let i = 3; i >= 0; i--) {
            const qIdx = curQ - i;
            const y = now.getFullYear() + Math.floor(qIdx / 4);
            const mm = (((qIdx % 4) + 4) % 4) * 3;
            starts.push(+new Date(y, mm, 1));
            labels.push('Q' + (mm / 3 + 1) + ' ' + String(y).slice(2));
        }
    } else {
        // Last 12 months
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            starts.push(+d);
            labels.push(MONTH_NAMES[d.getMonth()]);
        }
    }
    return { labels, starts };
}

function bucketIndex(dateMs, starts) {
    for (let i = starts.length - 1; i >= 0; i--) {
        if (dateMs >= starts[i]) return i;
    }
    return -1; // older than the visible range
}

function emailToName(email) {
    if (!email) return '';
    return email.split('@')[0]
        .replace(/[._]/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

async function updateOverviewChart() {
    const chart = window.cadenceChart;
    if (!chart) return;

    // 1) Get form responses (cached from summary load, else fetch)
    let rows = _overviewFormRows;
    if (!rows || rows.length === 0) {
        try {
            const resp = await fetch(SUMMARY_CONFIG.WEBAPP_URL + '?action=responses', { method: 'GET', mode: 'cors' });
            if (resp.ok) {
                const result = await resp.json();
                if (result.success) {
                    rows = result.data || [];
                    _overviewFormRows = rows;
                    buildFormCountMap(rows);
                    if (window.refreshTeamList) window.refreshTeamList();
                }
            }
        } catch (e) {
            console.error('Overview chart data error:', e);
        }
    }

    // 2) Context: session user, selected region, selected person
    const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
    const meEmail = (session.email || '').toLowerCase().trim();

    const bhVal = (document.getElementById('filterBH')?.value || '').toLowerCase().trim();
    const rclVal = (document.getElementById('filterRCL')?.value || '').toLowerCase().trim();
    const clVal = (document.getElementById('filterCL')?.value || '').toLowerCase().trim();
    const personEmail = clVal || rclVal || bhVal;

    const regionSel = (document.getElementById('filterRegion')?.value || '').trim();
    const regionName = regionSel ? ((window._regionById || {})[regionSel] || '') : '';

    const period = document.getElementById('chartPeriod')?.value || 'monthly';
    const chartType = document.getElementById('chartType')?.value || 'both';
    const { labels, starts } = getPeriodBuckets(period);
    const auditsArr = new Array(labels.length).fill(0);
    const meetingsArr = new Array(labels.length).fill(0);
    const mineAArr = new Array(labels.length).fill(0);
    const mineMArr = new Array(labels.length).fill(0);
    const personAArr = new Array(labels.length).fill(0);
    const personMArr = new Array(labels.length).fill(0);

    // 3) Aggregate rows into buckets — Audits and 1-1 & Training counted separately
    (rows || []).forEach(row => {
        const formType = row['Form Type'] || '';
        let dateStr = '';
        let rowRegion = '';
        if (formType === 'Audits') {
            dateStr = row['Audit Date'] || '';
            rowRegion = (row['Region (Audit)'] || '').toLowerCase().trim();
        } else if (formType === '1-1 & Training') {
            dateStr = row['Meeting Date'] || '';
            rowRegion = (row['Region (1-1)'] || '').toLowerCase().trim();
        } else {
            return;
        }

        const d = parseDateFlexible(dateStr);
        if (!d) return;
        const idx = bucketIndex(+d, starts);
        if (idx < 0) return;

        // Region constraint applies to all lines.
        // Form data is inconsistent ("Delhi+HR" vs "Delhi + HR"), so match ignoring whitespace.
        if (regionName && rowRegion.replace(/\s+/g, '') !== regionName.toLowerCase().replace(/\s+/g, '')) return;

        const subEmail = (row['Submitted By'] || '').toLowerCase().trim();
        const isAudit = formType === 'Audits';

        if (isAudit) auditsArr[idx]++;
        else meetingsArr[idx]++;

        if (meEmail && subEmail === meEmail) {
            if (isAudit) mineAArr[idx]++; else mineMArr[idx]++;
        }
        if (personEmail && subEmail === personEmail) {
            if (isAudit) personAArr[idx]++; else personMArr[idx]++;
        }
    });

    // 4) Update chart — datasets: [0] Region Audits, [1] Region 1-1, [2] Me, [3] Selected
    const dsAudits = chart.data.datasets[0];
    const dsMeetings = chart.data.datasets[1];
    const dsMe = chart.data.datasets[2];
    const dsPerson = chart.data.datasets[3];

    chart.data.labels = labels;

    if (chartType === 'audits') {
        dsAudits.data = auditsArr;
        dsMeetings.hidden = true;
        dsMe.data = mineAArr;
        dsPerson.data = personAArr;
    } else if (chartType === 'meetings') {
        dsAudits.hidden = true;
        dsMeetings.data = meetingsArr;
        dsMe.data = mineMArr;
        dsPerson.data = personMArr;
    } else {
        dsAudits.data = auditsArr;
        dsMeetings.data = meetingsArr;
        dsMe.data = mineAArr.map((v, i) => v + mineMArr[i]);
        dsPerson.data = personAArr.map((v, i) => v + personMArr[i]);
    }

    dsAudits.hidden = chartType === 'meetings';
    dsMeetings.hidden = chartType === 'audits';

    dsPerson.hidden = !personEmail;
    dsPerson.label = personEmail
        ? emailToName(personEmail) + ' (Selected)'
        : 'Selected BH/RCL/CL';

    chart.update('active');
}


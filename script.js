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
                    managedBHs: [],   
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

            // Add center
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

                regionData.centers.push(centerObj);

                if (bhEmail && bhEmail !== '-' && regionData.bhs[bhEmail]) {
                    regionData.bhs[bhEmail].centers.push(centerObj);
                }
            }
        });

        // Fill managedBHs / managedRCLs for hierarchy users
        Object.keys(rbhManagedBHs).forEach(rbhEmail => {
            if (allUsers[rbhEmail]) allUsers[rbhEmail].managedBHs = [...rbhManagedBHs[rbhEmail]];
        });
        Object.keys(rbhManagedRCLs).forEach(rbhEmail => {
            if (allUsers[rbhEmail]) allUsers[rbhEmail].managedRCLs = [...rbhManagedRCLs[rbhEmail]];
        });
        Object.keys(rclManagedBHs).forEach(rclEmail => {
            if (allUsers[rclEmail]) allUsers[rclEmail].managedBHs = [...rclManagedBHs[rclEmail]];
        });

        if (typeof ADMIN_EMAILS !== 'undefined') {
            ADMIN_EMAILS.forEach(email => {
                const normalized = email.toLowerCase().trim();
                if (!normalized || !allUsers[normalized]) return;
                allUsers[normalized].role = 'admin';
            });
        }

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

        let allowedRegions = null;
        let allowedBHs = null;
        let allowedRCLs = null;
        let allowedCenters = null;

        if (role.level <= 1) {
            const ownCenter = findCenterByCLOrName(user.email, user.center);
            allowedCenters = ownCenter ? [ownCenter.id] : (user.center ? [user.center] : []);
        } else if (role.level <= 2) {
            const bhData = findBH(user.bh);
            allowedBHs = [user.bh];
            allowedCenters = bhData ? bhData.centers.map(c => c.id) : [];
        } else if (role.level <= 3) {
            const rclUserData = orgData.users[user.email];
            const rclData = findRCL(user.rcl || user.email);
            if (rclUserData && rclUserData.managedBHs && rclUserData.managedBHs.length > 0) {
                allowedBHs = rclUserData.managedBHs;
            } else if (rclData) {
                allowedBHs = rclData.bhs;
            }
        } else if (role.level <= 4) {
            const rbhUserData = orgData.users[user.email];
            if (rbhUserData && rbhUserData.managedBHs && rbhUserData.managedBHs.length > 0) {
                allowedBHs = rbhUserData.managedBHs;
            }
            if (rbhUserData && rbhUserData.managedRCLs && rbhUserData.managedRCLs.length > 0) {
                allowedRCLs = rbhUserData.managedRCLs;
            }
            allowedRegions = [regionNameToId(user.region)];
        }

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

        if (allowedBHs && allowedBHs.length > 0) {
            centers = centers.filter(c => allowedBHs.includes(c.bhId));
        }
        if (allowedCenters && allowedCenters.length > 0) {
            centers = centers.filter(c => allowedCenters.includes(c.id));
        }
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
    function getAllowedBHs() {
        const user = session;
        const role = ROLES[currentRole];
        if (role.level <= 2) return [user.bh]; 
        if (role.level <= 3) {
            const u = orgData.users[user.email];
            return (u && u.managedBHs) ? u.managedBHs : [];
        }
        if (role.level <= 4) {
            const u = orgData.users[user.email];
            return (u && u.managedBHs) ? u.managedBHs : [];
        }
        return null; 
    }

    function getAllowedRCLs() {
        const user = session;
        const role = ROLES[currentRole];
        if (role.level <= 3) return [user.rcl || user.email];
        if (role.level <= 4) {
            const u = orgData.users[user.email];
            return (u && u.managedRCLs) ? u.managedRCLs : [];
        }
        return null; 
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
                if (allowedRCLs && !allowedRCLs.includes(rcl.id)) return;
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
        if (role.level <= 1) {
            const c = findCenterByCLOrName(user.email, user.center);
            const centerId = c ? c.id : user.center;
            sel.innerHTML += `<option value="${centerId}">${c ? c.name : user.center}</option>`;
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
    // 5. CASCADE
    // =============================================
    function onFilterChange(changedFilter) {
        const region = document.getElementById('filterRegion').value;
        if (changedFilter === 'region' || !changedFilter) {
            populateBHFilter(region);
            autoSelectOrShow('filterBH', 'filterBHGroup');
        }
        const bh = document.getElementById('filterBH').value;
        if (changedFilter === 'region' || changedFilter === 'bh' || !changedFilter) {
            populateRCLFilter(region, bh);
            autoSelectOrShow('filterRCL', 'filterRCLGroup');
        }
        const rcl = document.getElementById('filterRCL').value;
        if (changedFilter === 'region' || changedFilter === 'bh' || changedFilter === 'rcl' || !changedFilter) {
            populateCenterFilter(region, bh, rcl);
            autoSelectOrShow('filterCenter', 'filterCenterGroup');
        }
        const center = document.getElementById('filterCenter').value;
        if (changedFilter === 'region' || changedFilter === 'bh' || changedFilter === 'rcl' || changedFilter === 'center' || !changedFilter) {
            populateCLFilter(region, bh, rcl, center);
            autoSelectOrShow('filterCL', 'filterCLGroup');
        }
        updateDashboard();
    }

    function autoSelectOrShow(selId, groupId) {
        const selectEl = document.getElementById(selId);
        const groupEl = document.getElementById(groupId);
        if (!selectEl || !groupEl) return;
        const realOptions = Array.from(selectEl.options).filter(o => o.value !== '');
        if (realOptions.length === 1) selectEl.value = realOptions[0].value;
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

        [regionSel, bhSel, rclSel, centerSel, clSel].forEach(s => s.disabled = false);

        const userRegionId = regionNameToId(user.region);

        if (role.level <= 1) {
            regionSel.value = userRegionId; regionSel.disabled = true;
            bhSel.value = user.bh; bhSel.disabled = true;
            const ownCenter = findCenterByCLOrName(user.email, user.center);
            centerSel.value = ownCenter ? ownCenter.id : user.center; centerSel.disabled = true;
            clSel.value = user.email; clSel.disabled = true;
            rclSel.disabled = true;
        } else if (role.level <= 2) {
            regionSel.value = userRegionId; regionSel.disabled = true;
            bhSel.value = user.bh; bhSel.disabled = true;
        } else if (role.level <= 3) {
            regionSel.value = userRegionId; regionSel.disabled = true;
        } else if (role.level <= 4) {
            regionSel.value = userRegionId; regionSel.disabled = true;
        } else {
            regionSel.value = ''; bhSel.value = ''; rclSel.value = ''; centerSel.value = ''; clSel.value = '';
        }

        onFilterChange();

        if (role.level <= 2 && user.bh) {
            bhSel.value = user.bh;
            onFilterChange('bh');
        }
    }

    // =============================================
    // 7. UPDATE DASHBOARD 
    // =============================================
    function updateDashboard() {
        const region = document.getElementById('filterRegion').value;
        const bh = document.getElementById('filterBH').value;
        const rcl = document.getElementById('filterRCL').value;
        const center = document.getElementById('filterCenter').value;
        const cl = document.getElementById('filterCL').value;

        const centers = getVisibleData({ region, bh, rcl, center, cl });
        const { agg, monthly } = aggregateTasks(centers);

        animateCounter('totalTasks', agg.total);
        animateCounter('completedTasks', agg.completed);
        animateCounter('pendingTasks', agg.pending);
        animateCounter('overdueTasks', agg.overdue);

        updateTrend('trendTotal', agg.total, centers.length * 10);
        updateTrend('trendCompleted', agg.completed, agg.total);
        updateTrend('trendPending', agg.pending, agg.total);
        updateTrend('trendOverdue', agg.overdue, agg.total);

        updateOverviewChart();
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
    let maxOpenDepth = 2; 

    function updateTeamList(centers) {
        const container = document.getElementById('teamList');
        if (!container) return;

        lastCenters = centers;
        window.refreshTeamList = () => updateTeamList(lastCenters);

        const role = ROLES[currentRole];
        maxOpenDepth = role ? 6 - role.level : 2;

        const tree = {};

        centers.forEach(c => {
            const clEmail = c.cl;
            if (!clEmail) return;
            const clUser = orgData.users ? orgData.users[clEmail] : null;
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

        let html = '<div class="org-tree">';

        rbhKeys.forEach(rbhKey => {
            const rbh = tree[rbhKey];
            const bhKeys = Object.keys(rbh.bhs).sort((a, b) => (rbh.bhs[a].name || '').localeCompare(rbh.bhs[b].name || ''));
            const rclKeys = Object.keys(rbh.rcls).sort((a, b) => (rbh.rcls[a].name || '').localeCompare(rbh.rcls[b].name || ''));

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

        const bars = container.querySelectorAll('.progress');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const bar = entry.target;
                    setTimeout(() => { bar.style.width = bar.getAttribute('data-progress') + '%'; }, 200);
                    observer.unobserve(bar);
                }
            });
        }, { threshold: 0.5 });
        bars.forEach(bar => observer.observe(bar));
    }

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

    function renderTreeNode(name, role, count, childrenHtml, email, depth, subtreeEmails) {
        const stats = getTeamStats(subtreeEmails);
        const underCount = stats.team - 1; 
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

    function renderTreeLeaf(cl) {
        const fc = _formCountByEmail[(cl.email || '').toLowerCase()] || { total: 0, audits: 0, meetings: 0 };
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
                    { label: 'Region Audits', data: new Array(12).fill(0), borderColor: '#FF2D2D', backgroundColor: gradientAudit, fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#FF2D2D', pointBorderColor: '#0f172a', pointBorderWidth: 2, pointHoverRadius: 7 },
                    { label: 'Region 1-1 & Training', data: new Array(12).fill(0), borderColor: '#FF8A3D', backgroundColor: gradientMeeting, fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#FF8A3D', pointBorderColor: '#0f172a', pointBorderWidth: 2, pointHoverRadius: 7 },
                    { label: 'Me', data: new Array(12).fill(0), borderColor: '#22c55e', backgroundColor: gradientGreen, fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#22c55e', pointBorderColor: '#0f172a', pointBorderWidth: 2, pointHoverRadius: 7 },
                    { label: 'Selected BH/RCL/CL', data: new Array(12).fill(0), borderColor: '#14b8a6', backgroundColor: gradientBlue, fill: false, tension: 0.3, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#14b8a6', pointBorderColor: '#0f172a', pointBorderWidth: 2, pointHoverRadius: 7, borderDash: [6, 4], hidden: true }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                plugins: {
                    legend: { position: 'top', align: 'end', labels: { color: '#94a3b8', usePointStyle: true, pointStyle: 'circle', padding: 20, font: { size: 12, family: 'Inter' } } },
                    tooltip: { backgroundColor: '#1e293b', titleColor: '#f1f5f9', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1, padding: 12, cornerRadius: 8, titleFont: { size: 13, weight: '600' }, bodyFont: { size: 12 }, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}` } }
                },
                scales: {
                    x: { grid: { color: 'rgba(51,65,85,0.3)', drawBorder: false }, ticks: { color: '#64748b', font: { size: 11, family: 'Inter' } } },
                    y: { grid: { color: 'rgba(51,65,85,0.3)', drawBorder: false }, ticks: { color: '#64748b', font: { size: 11, family: 'Inter' }, precision: 0 }, beginAtZero: true }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });
        window.cadenceChart = cadenceChart;
    }

    // =============================================
    // 10. PROFILE DROPDOWN & SETTINGS MODAL
    // =============================================
    function initProfile() {
        const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
        const email = session.email || '';
        const name = email.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
        document.addEventListener('click', () => profileDropdown.style.display = 'none');
        profileDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    document.getElementById('dropdownSettings')?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.style.display = 'none';
        window.location.href = 'settings.html';
    });

    document.getElementById('dropdownLogout')?.addEventListener('click', () => {
        localStorage.removeItem('cadence-session');
        window.location.href = 'login.html';
    });

    // =============================================
    // 11. EVENT LISTENERS
    // =============================================
    document.getElementById('filterRegion').addEventListener('change', () => onFilterChange('region'));
    document.getElementById('filterBH').addEventListener('change', () => onFilterChange('bh'));
    document.getElementById('filterRCL').addEventListener('change', () => onFilterChange('rcl'));
    document.getElementById('filterCenter').addEventListener('change', () => onFilterChange('center'));

    document.getElementById('filterResetBtn').addEventListener('click', () => {
        const role = ROLES[currentRole];
        if (role.level <= 4) showToast('Some filters are locked by your role.', 'info');
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
        onFilterChange();
        showToast('Filters reset!', 'info');
    });

    document.getElementById('chartPeriod')?.addEventListener('change', (e) => {
        showToast(`Chart updated to ${e.target.value} view`, 'info');
        updateOverviewChart();
    });

    document.getElementById('chartType')?.addEventListener('change', () => updateOverviewChart());

    document.getElementById('fullscreenBtn')?.addEventListener('click', function () {
        if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(() => {}); this.innerHTML = '<i class="fas fa-compress"></i>'; }
        else { document.exitFullscreen(); this.innerHTML = '<i class="fas fa-expand"></i>'; }
    });

    document.getElementById('refreshBtn')?.addEventListener('click', function () {
        this.querySelector('i').classList.add('loading');
        showToast('Refreshing...', 'info');
        setTimeout(() => { 
            this.querySelector('i').classList.remove('loading'); 
            initDashboard();
        }, 1200);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal-overlay.active');
            modals.forEach(m => { m.classList.remove('active'); m.style.display = 'none'; });
        }
    });

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

    populateRegionFilter();
    populateBHFilter('');
    populateRCLFilter('', '');
    populateCenterFilter('', '', '');
    populateCLFilter('', '', '', '');
    initChart();
    applyRoleRestrictions();
    updateDashboard();

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

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to sign out?')) {
            localStorage.removeItem('cadence-session');
            window.location.href = 'login.html';
        }
    });

    console.log('%c CADENCE Report Dashboard Loaded ', 'background: linear-gradient(135deg, #3b82f6, #a855f7); color: white; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 14px;');

    } catch (err) {
        console.error('CADENCE Init Error:', err);
    }
}

// ===============================================
// COUNSELLING SUMMARY — New Hierarchy Formulas
// ===============================================

const SUMMARY_CONFIG = {
    WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbyCL_Sh0wjtmSLy1aun02yuVD1TljUE65lty3aJKcFFgx_G8NMvDPA6NUiVL43B-HRA/exec'
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
        const resp = await fetch(SUMMARY_CONFIG.WEBAPP_URL + '?action=responses', { method: 'GET', mode: 'cors' });
        if (!resp.ok) throw new Error('Web app HTTP ' + resp.status);
        const result = await resp.json();
        if (!result.success) throw new Error(result.error || 'Web app failed');
        const rows = result.data || [];

        let sheetRows = [];
        try { sheetRows = await fetchSheetData(); } catch (e) {}

        const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
        const sessionEmail = (session.email || '').toLowerCase().trim();

        const { roleMap, bhOfUser, rclOfUser, rbhOfUser } = buildSummaryHierarchy(sheetRows);
        
        if (sessionEmail && session.role && !roleMap[sessionEmail]) {
            roleMap[sessionEmail] = session.role;
        }

        const visibleEmails = getSummaryVisibleEmails(sessionEmail, roleMap, bhOfUser, rclOfUser, rbhOfUser, session.role);

        const fromDate = document.getElementById('summaryFromDate').value;
        const toDate = document.getElementById('summaryToDate').value;

        const summary = processResponses(rows, roleMap, fromDate, toDate, visibleEmails);

        els.loading.style.display = 'none';
        if (summary.length === 0) { els.empty.style.display = 'block'; return; }

        renderSummaryTable(els.tbody, summary);
        els.tableWrap.style.display = 'block';

        initRecentAndCharts(rows, roleMap);

    } catch (err) {
        console.error('Summary error:', err);
        els.loading.style.display = 'none';
        els.error.style.display = 'block';
        els.errorMsg.textContent = err.message || 'Failed to load summary.';
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

        if (bh && bh !== '-' && !roleMap[bh]) hierarchyRoles[bh] = 'BH';
        if (rcl && rcl !== '-' && !roleMap[rcl]) hierarchyRoles[rcl] = 'RCL';
        if (rbh && rbh !== '-' && !roleMap[rbh]) hierarchyRoles[rbh] = 'RBH';

        if (bh && bh !== '-') {
            bhOfUser[email] = bhOfUser[email] || new Set(); bhOfUser[email].add(bh);
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
        allEmails.forEach(e => { if (rbhOfUser[e]?.has(sessionEmail)) visible.add(e); });
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

    if (sessionEmail) visible.add(sessionEmail);
    return visible;
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

// Logic implementations strictly required by prompt
function processResponses(rows, roleMap, fromDate, toDate, visibleEmails) {
    const userStats = {};
    
    // Generates an ISO format YYYY-Www representing the week, starting on Monday.
    function getISOWeekString(d) {
        const date = new Date(d.getTime());
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
        const week1 = new Date(date.getFullYear(), 0, 4);
        const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        return date.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
    }
    
    const currentWeekStr = getISOWeekString(new Date());

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

        if (!userStats[email]) {
            userStats[email] = { 
                email, 
                audits: 0, 
                meetings: 0, 
                auditDates: new Set(), 
                auditWeeks: new Set(),
                meetingDates: new Set(), 
                meetingWeeks: new Set() 
            };
        }
        const s = userStats[email];
        const dateIso = rowDate.toISOString().split('T')[0];
        const weekIso = getISOWeekString(rowDate);

        if (formType === 'Audits') {
            s.audits++;
            s.auditDates.add(dateIso);
            if (weekIso !== currentWeekStr) s.auditWeeks.add(weekIso);
        }
        else if (formType === '1-1 & Training') {
            s.meetings++;
            s.meetingDates.add(dateIso);
            if (weekIso !== currentWeekStr) s.meetingWeeks.add(weekIso);
        }
    });

    function getAuditDayStatus(role, avg) {
        if (role === 'BH' && avg >= 2) return 'On Track';
        if (role === 'CL' && avg >= 4) return 'On Track';
        if (role === 'RCL' && avg >= 3) return 'On Track';
        return 'Off track';
    }
    function getAuditWeekStatus(role, avg) {
        if (role === 'BH' && avg >= 12) return 'On Track';
        if (role === 'CL' && avg >= 24) return 'On Track';
        if (role === 'RCL' && avg >= 18) return 'On Track';
        return 'Off track';
    }
    function getMeetingDayStatus(role, avg) {
        if (role === 'BH' && avg >= 1) return 'On Track';
        if (role === 'CL' && avg >= 1) return 'On Track';
        if (role === 'RCL' && avg >= 2) return 'On Track';
        return 'Off track';
    }
    function getMeetingWeekStatus(role, avg) {
        if (role === 'BH' && avg >= 6) return 'On Track';
        if (role === 'CL' && avg >= 6) return 'On Track';
        if (role === 'RCL' && avg >= 12) return 'On Track';
        return 'Off track';
    }

    const result = Object.values(userStats).map(s => {
        const role = (roleMap[s.email] || 'CL').toUpperCase();
        
        const aDays = Math.max(1, s.auditDates.size);
        const aWeeks = Math.max(1, s.auditWeeks.size); 
        const aDailyAvg = +((s.audits / aDays).toFixed(1));
        const aWeeklyAvg = +((s.audits / aWeeks).toFixed(1));

        const mDays = Math.max(1, s.meetingDates.size);
        const mWeeks = Math.max(1, s.meetingWeeks.size);
        const mDailyAvg = +((s.meetings / mDays).toFixed(1));
        const mWeeklyAvg = +((s.meetings / mWeeks).toFixed(1));

        return {
            email: s.email,
            role: roleMap[s.email] || 'CL',
            noOfAudits: s.audits,
            auditsDailyAvg: aDailyAvg,
            auditDayStatus: getAuditDayStatus(role, aDailyAvg),
            auditsWeeklyAvg: aWeeklyAvg,
            auditWeekStatus: getAuditWeekStatus(role, aWeeklyAvg),
            noOfMeetings: s.meetings,
            meetingsDailyAvg: mDailyAvg,
            meetingDayStatus: getMeetingDayStatus(role, mDailyAvg),
            meetingsWeeklyAvg: mWeeklyAvg,
            meetingWeekStatus: getMeetingWeekStatus(role, mWeeklyAvg)
        };
    });

    result.sort((a, b) => b.noOfAudits - a.noOfAudits || b.noOfMeetings - a.noOfMeetings);
    return result;
}

function renderSummaryTable(tbody, data) {
    tbody.innerHTML = '';
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        const badge = s => {
            const c = s === 'On Track' ? '#22c55e' : '#ef4444';
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

    buildFormCountMap(_overviewFormRows);
    loadRecentActivity(_overviewFormRows, _overviewRoleMap);
    updateOverviewChart();
    if (window.refreshTeamList) window.refreshTeamList();
    initCustomNewDashboard();
}

function loadRecentActivity(rows, roleMap) {
    const list = document.getElementById('activityList');
    const countEl = document.getElementById('activityCount');
    if (!list) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const todayEntries = rows.filter(r => {
        const submittedAt = r['Submitted At'];
        if (!submittedAt) return false;
        const d = new Date(submittedAt);
        return !isNaN(d) && d.toISOString().split('T')[0] === todayStr;
    }).sort((a, b) => {
        const tA = new Date(a['Submitted At'] || 0).getTime();
        const tB = new Date(b['Submitted At'] || 0).getTime();
        return tB - tA; 
    });

    if (countEl) countEl.textContent = todayEntries.length + ' today';

    if (todayEntries.length === 0) {
        list.innerHTML = `<li class="activity-item" style="text-align:center;padding:20px;color:var(--text-muted);"><i class="fas fa-inbox" style="font-size:1.2rem;margin-bottom:6px;display:block;"></i>No activity today</li>`;
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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getPeriodBuckets(period) {
    const now = new Date();
    const starts = [];
    const labels = [];

    if (period === 'weekly') {
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
        const curQ = Math.floor(now.getMonth() / 3);
        for (let i = 3; i >= 0; i--) {
            const qIdx = curQ - i;
            const y = now.getFullYear() + Math.floor(qIdx / 4);
            const mm = (((qIdx % 4) + 4) % 4) * 3;
            starts.push(+new Date(y, mm, 1));
            labels.push('Q' + (mm / 3 + 1) + ' ' + String(y).slice(2));
        }
    } else {
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
    return -1;
}

function emailToName(email) {
    if (!email) return '';
    return email.split('@')[0].replace(/[._]/g, ' ').split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function updateOverviewChart() {
    const chart = window.cadenceChart;
    if (!chart) return;

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
        } catch (e) {}
    }

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
        } else return;

        const d = parseDateFlexible(dateStr);
        if (!d) return;
        const idx = bucketIndex(+d, starts);
        if (idx < 0) return;

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

    const dsAudits = chart.data.datasets[0];
    const dsMeetings = chart.data.datasets[1];
    const dsMe = chart.data.datasets[2];
    const dsPerson = chart.data.datasets[3];

    chart.data.labels = labels;

    if (chartType === 'audits') {
        dsAudits.data = auditsArr; dsMeetings.hidden = true; dsMe.data = mineAArr; dsPerson.data = personAArr;
    } else if (chartType === 'meetings') {
        dsAudits.hidden = true; dsMeetings.data = meetingsArr; dsMe.data = mineMArr; dsPerson.data = personMArr;
    } else {
        dsAudits.data = auditsArr; dsMeetings.data = meetingsArr;
        dsMe.data = mineAArr.map((v, i) => v + mineMArr[i]);
        dsPerson.data = personAArr.map((v, i) => v + personMArr[i]);
    }

    dsAudits.hidden = chartType === 'meetings';
    dsMeetings.hidden = chartType === 'audits';

    dsPerson.hidden = !personEmail;
    dsPerson.label = personEmail ? emailToName(personEmail) + ' (Selected)' : 'Selected BH/RCL/CL';

    chart.update('active');
}

// ===============================================
// NEW CUSTOM DASHBOARD FEATURES
// ===============================================
let customTrendChart = null;
let customRegionChart = null;

function initCustomNewDashboard() {
    const startInput = document.getElementById('customStartDate');
    const endInput = document.getElementById('customEndDate');
    if(startInput) startInput.addEventListener('change', updateCustomNewDashboard);
    if(endInput) endInput.addEventListener('change', updateCustomNewDashboard);
    
    document.getElementById('filterRegion')?.addEventListener('change', updateCustomNewDashboard);
    document.getElementById('filterBH')?.addEventListener('change', updateCustomNewDashboard);
    document.getElementById('filterRCL')?.addEventListener('change', updateCustomNewDashboard);
    
    updateCustomNewDashboard();
}

function updateCustomNewDashboard() {
    const rows = _overviewFormRows || [];
    const roleMap = _overviewRoleMap || {};

    const startVal = document.getElementById('customStartDate')?.value;
    const endVal = document.getElementById('customEndDate')?.value;
    const startDate = startVal ? new Date(startVal) : null;
    const endDate = endVal ? new Date(endVal + 'T23:59:59') : null;

    const regionFilter = (document.getElementById('filterRegion')?.value || '').trim();
    const regionNameFilter = regionFilter ? ((window._regionById || {})[regionFilter] || '') : '';

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let filteredCount = 0;
    let overallCount = 0; 
    let mtdCount = 0; 
    let membersSet = new Set();

    let trendMap = {}; 
    let regionMap = {}; 
    let userStats = {}; 

    rows.forEach(row => {
        const formType = row['Form Type'] || '';
        const email = (row['Submitted By'] || '').toLowerCase().trim();
        const role = (roleMap[email] || 'CL').toUpperCase();
        
        const rowRegion = (row['Region (Audit)'] || row['Region (1-1)'] || 'Unknown').trim();
        
        if (regionNameFilter && rowRegion.replace(/\s+/g, '').toLowerCase() !== regionNameFilter.replace(/\s+/g, '').toLowerCase()) return;
        
        let dateStr = formType === 'Audits' ? row['Audit Date'] : row['Meeting Date'];
        if (!dateStr && row['Submitted At']) dateStr = row['Submitted At'].split('T')[0];
        const rowDate = parseDateFlexible(dateStr);
        const dateKey = rowDate ? rowDate.toISOString().split('T')[0] : 'Unknown';

        let isMTD = false;
        if (rowDate && rowDate.getMonth() === currentMonth && rowDate.getFullYear() === currentYear) {
            mtdCount++;
            isMTD = true;
        }

        overallCount++;

        let inDateRange = true;
        if (startDate && rowDate < startDate) inDateRange = false;
        if (endDate && rowDate > endDate) inDateRange = false;

        if (inDateRange) {
            filteredCount++;
            if (['BH', 'CL', 'RCL', 'RBH'].includes(role)) membersSet.add(email);

            if (dateKey !== 'Unknown') {
                if (!trendMap[dateKey]) trendMap[dateKey] = { audit: 0, meeting: 0 };
                if (formType === 'Audits') trendMap[dateKey].audit++;
                else trendMap[dateKey].meeting++;
            }

            if (rowRegion !== 'Unknown') regionMap[rowRegion] = (regionMap[rowRegion] || 0) + 1;
        }

        if (!userStats[email]) userStats[email] = { email: email, role: role, overall: 0, mtd: 0 };
        userStats[email].overall++;
        if (isMTD) userStats[email].mtd++;
    });

    const elFiltered = document.getElementById('newKpiFiltered');
    if(elFiltered) elFiltered.textContent = filteredCount;
    const elOverall = document.getElementById('newKpiOverall');
    if(elOverall) elOverall.textContent = overallCount;
    const elMTD = document.getElementById('newKpiMTD');
    if(elMTD) elMTD.textContent = mtdCount;
    const elMembers = document.getElementById('newKpiMembers');
    if(elMembers) elMembers.textContent = membersSet.size;

    const trendDates = Object.keys(trendMap).sort();
    const auditData = trendDates.map(d => trendMap[d].audit);
    const meetingData = trendDates.map(d => trendMap[d].meeting);

    const ctxTrend = document.getElementById('customTrendChart')?.getContext('2d');
    if (ctxTrend) {
        if (customTrendChart) customTrendChart.destroy();
        customTrendChart = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: trendDates,
                datasets: [
                    { label: 'Audits', data: auditData, borderColor: '#a855f7', backgroundColor: '#a855f7', tension: 0.3, fill: false },
                    { label: '1-1 Training', data: meetingData, borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.3, fill: false }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const regions = Object.keys(regionMap);
    const regionCounts = regions.map(r => regionMap[r]);

    const ctxRegion = document.getElementById('customRegionChart')?.getContext('2d');
    if (ctxRegion) {
        if (customRegionChart) customRegionChart.destroy();
        customRegionChart = new Chart(ctxRegion, {
            type: 'bar',
            data: {
                labels: regions,
                datasets: [{ label: 'Form Submissions (Filtered)', data: regionCounts, backgroundColor: '#22c55e', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    let eligibleUsers = Object.values(userStats).filter(u => ['BH', 'CL', 'RCL', 'CM'].includes(u.role));
    eligibleUsers.sort((a, b) => b.overall - a.overall);

    const top10 = eligibleUsers.slice(0, 10);
    const bottom10 = eligibleUsers.slice().reverse().slice(0, 10);

    const buildTable = (arr) => arr.map(u => `
        <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 10px;"><b>${u.email}</b><br><small style="color:var(--text-muted);">${u.role}</small></td>
            <td style="padding: 10px; font-weight: 600;">${u.overall}</td>
            <td style="padding: 10px; color: var(--accent-blue);">${u.mtd}</td>
        </tr>
    `).join('');

    const tbTop = document.getElementById('top10Body');
    const tbBottom = document.getElementById('bottom10Body');
    if (tbTop) tbTop.innerHTML = buildTable(top10);
    if (tbBottom) tbBottom.innerHTML = buildTable(bottom10);
}

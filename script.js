/* ============================================
   CADENCE REPORT - JavaScript
   Dashboard with Role-Based Hierarchical Filters
   ============================================ */

document.addEventListener('DOMContentLoaded', initDashboard);

// Also run if DOMContentLoaded already fired
if (document.readyState !== 'loading') initDashboard();

function initDashboard() {
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
    // 1. ORGANIZATIONAL DATA MODEL
    // =============================================
    const orgData = {
        regions: [
            {
                id: 'north',
                name: 'North Region',
                bhs: [
                    {
                        id: 'bh-n1',
                        name: 'Rajesh Kumar',
                        centers: [
                            {
                                id: 'c-n1-a',
                                name: 'Delhi Central',
                                cl: { id: 'cl-vt', name: 'Vikram Thapa' },
                                tasks: { total: 42, completed: 35, pending: 5, overdue: 2 },
                                monthly: { assigned: [5, 6, 4, 7, 5, 8, 6, 9, 7, 10, 8, 11], completed: [4, 5, 3, 6, 4, 7, 5, 8, 6, 9, 7, 10], overdue: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
                            },
                            {
                                id: 'c-n1-b',
                                name: 'Delhi North',
                                cl: { id: 'cl-pj', name: 'Priya Joshi' },
                                tasks: { total: 38, completed: 30, pending: 6, overdue: 2 },
                                monthly: { assigned: [4, 5, 4, 6, 5, 7, 5, 8, 6, 9, 7, 10], completed: [3, 4, 3, 5, 4, 6, 4, 7, 5, 8, 6, 9], overdue: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
                            }
                        ]
                    },
                    {
                        id: 'bh-n2',
                        name: 'Suresh Patel',
                        centers: [
                            {
                                id: 'c-n2-a',
                                name: 'Jaipur Hub',
                                cl: { id: 'cl-rs', name: 'Rahul Sharma' },
                                tasks: { total: 35, completed: 28, pending: 5, overdue: 2 },
                                monthly: { assigned: [4, 5, 3, 6, 4, 7, 5, 8, 6, 9, 7, 9], completed: [3, 4, 2, 5, 3, 6, 4, 7, 5, 8, 6, 8], overdue: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
                            }
                        ]
                    }
                ],
                rcls: [
                    {
                        id: 'rcl-a1',
                        name: 'Amit Verma',
                        bhs: ['bh-n1', 'bh-n2']
                    },
                    {
                        id: 'rcl-a2',
                        name: 'Deepak Gupta',
                        bhs: ['bh-n1']
                    }
                ]
            },
            {
                id: 'south',
                name: 'South Region',
                bhs: [
                    {
                        id: 'bh-s1',
                        name: 'Manoj Singh',
                        centers: [
                            {
                                id: 'c-s1-a',
                                name: 'Chennai Main',
                                cl: { id: 'cl-ak', name: 'Ankit Kumar' },
                                tasks: { total: 45, completed: 38, pending: 4, overdue: 3 },
                                monthly: { assigned: [5, 7, 5, 8, 6, 9, 7, 10, 8, 11, 9, 12], completed: [4, 6, 4, 7, 5, 8, 6, 9, 7, 10, 8, 11], overdue: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
                            },
                            {
                                id: 'c-s1-b',
                                name: 'Bangalore East',
                                cl: { id: 'cl-nr', name: 'Neha Reddy' },
                                tasks: { total: 40, completed: 32, pending: 6, overdue: 2 },
                                monthly: { assigned: [5, 6, 4, 7, 5, 8, 6, 9, 7, 10, 8, 11], completed: [4, 5, 3, 6, 4, 7, 5, 8, 6, 9, 7, 10], overdue: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
                            }
                        ]
                    }
                ],
                rcls: [
                    {
                        id: 'rcl-b1',
                        name: 'Sanjay Menon',
                        bhs: ['bh-s1']
                    }
                ]
            },
            {
                id: 'west',
                name: 'West Region',
                bhs: [
                    {
                        id: 'bh-w1',
                        name: 'Pankaj Joshi',
                        centers: [
                            {
                                id: 'c-w1-a',
                                name: 'Mumbai Central',
                                cl: { id: 'cl-dp', name: 'Deepa Patil' },
                                tasks: { total: 50, completed: 42, pending: 5, overdue: 3 },
                                monthly: { assigned: [6, 8, 5, 9, 7, 10, 8, 11, 9, 12, 10, 13], completed: [5, 7, 4, 8, 6, 9, 7, 10, 8, 11, 9, 12], overdue: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
                            },
                            {
                                id: 'c-w1-b',
                                name: 'Mumbai West',
                                cl: { id: 'cl-vs', name: 'Vikram Singh' },
                                tasks: { total: 33, completed: 25, pending: 5, overdue: 3 },
                                monthly: { assigned: [4, 5, 3, 6, 4, 7, 5, 8, 6, 9, 7, 9], completed: [3, 4, 2, 5, 3, 6, 4, 7, 5, 8, 6, 8], overdue: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
                            }
                        ]
                    },
                    {
                        id: 'bh-w2',
                        name: 'Ravi Deshmukh',
                        centers: [
                            {
                                id: 'c-w2-a',
                                name: 'Pune South',
                                cl: { id: 'cl-sg', name: 'Suresh Gaikwad' },
                                tasks: { total: 30, completed: 22, pending: 5, overdue: 3 },
                                monthly: { assigned: [3, 4, 3, 5, 4, 6, 4, 7, 5, 8, 6, 8], completed: [2, 3, 2, 4, 3, 5, 3, 6, 4, 7, 5, 7], overdue: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
                            },
                            {
                                id: 'c-w2-b',
                                name: 'Pune North',
                                cl: { id: 'cl-ak2', name: 'Alok Kulkarni' },
                                tasks: { total: 28, completed: 20, pending: 5, overdue: 3 },
                                monthly: { assigned: [3, 4, 3, 5, 4, 6, 4, 7, 5, 8, 6, 8], completed: [2, 3, 2, 4, 3, 5, 3, 6, 4, 7, 5, 7], overdue: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
                            }
                        ]
                    }
                ],
                rcls: [
                    {
                        id: 'rcl-c1',
                        name: 'Kiran Bhatt',
                        bhs: ['bh-w1', 'bh-w2']
                    }
                ]
            }
        ]
    };

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

    // Users mapped to roles
    const USERS = {
        admin: { name: 'Administrator',   role: 'admin' },
        rbh:   { name: 'Rajesh Kumar',    role: 'rbh',   regionId: 'north', rbhId: 'bh-n1' },
        rcl:   { name: 'Amit Verma',      role: 'rcl',   regionId: 'north', rclId: 'rcl-a1' },
        bh:    { name: 'Manoj Singh',     role: 'bh',    regionId: 'south', bhId: 'bh-s1' },
        cl:    { name: 'Vikram Thapa',    role: 'cl',    regionId: 'north', bhId: 'bh-n1', centerId: 'c-n1-a' }
    };

    let currentRole = session.role || 'admin';
    let cadenceChart = null;

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
        const user = USERS[currentRole];

        // Role-based restrictions
        let allowedRegions = null;
        let allowedBHs = null;
        let allowedRCLs = null;
        let allowedCenters = null;

        if (role.level <= 1) {
            // CL: own center only
            allowedCenters = [user.centerId];
        } else if (role.level <= 2) {
            // BH: own centers only
            const bhData = findBH(user.bhId);
            allowedBHs = [user.bhId];
            allowedCenters = bhData ? bhData.centers.map(c => c.id) : [];
        } else if (role.level <= 3) {
            // RCL: BHs managed by this RCL
            const rclData = findRCL(user.rclId);
            allowedBHs = rclData ? rclData.bhs : [];
        } else if (role.level <= 4) {
            // RBH: all BH + RCL under this RBH's region
            allowedRegions = [user.regionId];
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
            centers = centers.filter(c => c.cl.id === cl);
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
        orgData.regions.forEach(r => {
            if (regionId && r.id !== regionId) return;
            r.bhs.forEach(bh => {
                sel.innerHTML += `<option value="${bh.id}">${bh.name} (${r.name})</option>`;
            });
        });
    }

    function populateRCLFilter(regionId, bhId) {
        const sel = document.getElementById('filterRCL');
        sel.innerHTML = '<option value="">All RCL</option>';
        orgData.regions.forEach(r => {
            if (regionId && r.id !== regionId) return;
            r.rcls.forEach(rcl => {
                // If BH is selected, only show RCLs that manage that BH
                if (bhId && !rcl.bhs.includes(bhId)) return;
                sel.innerHTML += `<option value="${rcl.id}">${rcl.name} (${r.name})</option>`;
            });
        });
    }

    function populateCenterFilter(regionId, bhId, rclId) {
        const sel = document.getElementById('filterCenter');
        sel.innerHTML = '<option value="">All Centers</option>';
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
                    sel.innerHTML += `<option value="${c.cl.id}">${c.cl.name} (${c.name})</option>`;
                });
            });
        });
    }

    // =============================================
    // 5. CASCADE: When upper filter changes, update lower filters
    // =============================================
    function onFilterChange() {
        const region = document.getElementById('filterRegion').value;
        const bh = document.getElementById('filterBH').value;
        const rcl = document.getElementById('filterRCL').value;
        const center = document.getElementById('filterCenter').value;

        populateBHFilter(region);
        populateRCLFilter(region, bh);
        populateCenterFilter(region, bh, rcl);
        populateCLFilter(region, bh, rcl, center);
    }

    // =============================================
    // 6. ROLE-BASED FILTER LOCKING
    // =============================================
    function applyRoleRestrictions() {
        const user = USERS[currentRole];
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
        document.getElementById('sidebarUserName').textContent = user.name;
        document.getElementById('sidebarUserRole').textContent = role.label;
        document.getElementById('sidebarAvatar').innerHTML = `<i class="${role.icon}"></i>`;

        // Update role badge (this replaces innerHTML so do it last)
        const roleBadgeEl = document.getElementById('currentRoleBadge');
        roleBadgeEl.innerHTML = `<i class="${role.icon}"></i><span id="currentRoleText">${role.label} - ${user.name}</span>`;

        // Access indicator
        const indicator = document.getElementById('accessIndicator');
        if (role.level === 5) {
            indicator.innerHTML = '<i class="fas fa-lock-open"></i> Full Access';
            indicator.className = 'access-indicator';
        } else {
            indicator.innerHTML = `<i class="fas fa-lock"></i> ${role.canSee.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
            indicator.className = 'access-indicator limited';
        }

        if (role.level <= 1) {
            // CL: lock everything, auto-select their center
            regionSel.value = user.regionId;
            regionSel.disabled = true;
            bhSel.value = user.bhId;
            bhSel.disabled = true;
            centerSel.value = user.centerId;
            centerSel.disabled = true;
            clSel.value = user.cl?.id || '';
            clSel.disabled = true;
            rclSel.disabled = true;
        } else if (role.level <= 2) {
            // BH: lock region, auto-select their BH
            regionSel.value = user.regionId;
            regionSel.disabled = true;
            bhSel.value = user.bhId;
            bhSel.disabled = true;
        } else if (role.level <= 3) {
            // RCL: lock region
            regionSel.value = user.regionId;
            regionSel.disabled = true;
        } else if (role.level <= 4) {
            // RBH: lock region
            regionSel.value = user.regionId;
            regionSel.disabled = true;
        } else {
            // Admin: reset all filters to default
            regionSel.value = '';
            bhSel.value = '';
            rclSel.value = '';
            centerSel.value = '';
            clSel.value = '';
        }

        // Repopulate with restrictions
        onFilterChange();
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
            if (!clMap[c.cl.id]) {
                clMap[c.cl.id] = { name: c.cl.name, center: c.name, tasks: c.tasks };
            } else {
                clMap[c.cl.id].tasks.total += c.tasks.total;
                clMap[c.cl.id].tasks.completed += c.tasks.completed;
            }
        });

        let html = '';
        Object.values(clMap).forEach(person => {
            const pct = person.tasks.total > 0 ? Math.round((person.tasks.completed / person.tasks.total) * 100) : 0;
            const initials = person.name.split(' ').map(n => n[0]).join('');
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
                onFilterChange();
                updateDashboard();
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

    // Role switcher
    document.getElementById('roleSelect').addEventListener('change', (e) => {
        switchRole(e.target.value);
    });

    function switchRole(roleKey) {
        currentRole = roleKey;
        applyRoleRestrictions();
        updateDashboard();
        showToast(`Switched to ${ROLES[currentRole].label}: ${USERS[currentRole].name}`, 'info');
    }

    // Filter cascade: when upper filter changes
    ['filterRegion', 'filterBH', 'filterRCL', 'filterCenter'].forEach(id => {
        document.getElementById(id).addEventListener('change', onFilterChange);
    });

    // Apply Filters button
    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        updateDashboard();
        showToast('Filters applied successfully!', 'success');
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
        onFilterChange();
        updateDashboard();
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
        setTimeout(() => { this.querySelector('i').classList.remove('loading'); updateDashboard(); showToast('Dashboard updated!', 'success'); }, 1200);
    });

    // Quick actions
    const qaMsgs = { newReportBtn: 'Opening Report Builder...', exportBtn: 'Generating PDF...', shareBtn: 'Link copied!', scheduleBtn: 'Opening scheduler...', settingsBtn: 'Opening settings...' };
    Object.entries(qaMsgs).forEach(([id, msg]) => {
        document.getElementById(id)?.addEventListener('click', () => showToast(msg, 'info'));
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

    // Expose switchRole globally for testing
    window.switchRole = switchRole;

    // ========== LOGOUT ==========
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to sign out?')) {
            localStorage.removeItem('cadence-session');
            window.location.href = 'login.html';
        }
    });

    console.log('%c CADENCE Report Dashboard Loaded ', 'background: linear-gradient(135deg, #3b82f6, #a855f7); color: white; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 14px;');

    } catch (err) {
        console.error('CADENCE Init Error:', err);
        document.title = 'INIT_ERROR: ' + err.message + ' at ' + (err.stack || '').split('\n')[1];
    }
}

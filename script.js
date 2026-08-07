// ==========================================
// DASHBOARD LOGIC AND VIEW GENERATION
// ==========================================

let globalFormData = [];
let globalHierarchy = [];
let trendChartInstance = null;
let regionChartInstance = null;

// 1. You will call this function right after your Google Sheets fetch finishes!
function initializeCustomDashboard(formResponses, hierarchyData) {
    globalFormData = formResponses;
    globalHierarchy = hierarchyData;
    
    // Process and draw the views for the first time
    applyDashboardFilters();
}

// 2. The Master Function that applies filters and calculates all KPIs and Views
function applyDashboardFilters() {
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;
    
    let filteredData = globalFormData;
    
    // Create lookup for User Roles from Hierarchy Data
    let userRoles = {};
    globalHierarchy.forEach(user => {
        if(user.mail_id) {
            userRoles[user.mail_id.toLowerCase().trim()] = user.role.toLowerCase().trim();
        }
    });

    // Determine current Month and Year for MTD calculation
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Get MTD Data (Unfiltered by date picker)
    let mtdData = globalFormData.filter(row => {
        let dateStr = row['Meeting Date'] || row['Audit Date'] || (row['Submitted At'] ? row['Submitted At'].split('T')[0] : null);
        if(!dateStr) return false;
        let rowDate = new Date(dateStr);
        return rowDate.getMonth() === currentMonth && rowDate.getFullYear() === currentYear;
    });

    // Apply User's Date Filter if selected
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        filteredData = globalFormData.filter(row => {
            let dateStr = row['Meeting Date'] || row['Audit Date'] || (row['Submitted At'] ? row['Submitted At'].split('T')[0] : null);
            if(!dateStr) return false;
            let rowDate = new Date(dateStr);
            return rowDate >= start && rowDate <= end;
        });
    }

    // --- UPDATE KPIs ---
    // KPI 1: Filtered Total
    document.getElementById('kpiFiltered').innerText = filteredData.length;
    // KPI 2: Overall Total (ignores date filter)
    document.getElementById('kpiOverall').innerText = globalFormData.length;
    // KPI 3: MTD Total (ignores date filter)
    document.getElementById('kpiMTD').innerText = mtdData.length;
    
    // KPI 4: Total specific members filling the form
    let targetRoles = ['bh', 'cl', 'rcl', 'rbh'];
    let uniqueMembers = new Set();
    filteredData.forEach(row => {
        let email = (row['Submitted By'] || '').toLowerCase().trim();
        let role = userRoles[email] || 'unknown';
        if (targetRoles.includes(role)) {
            uniqueMembers.add(email);
        }
    });
    document.getElementById('kpiMembers').innerText = uniqueMembers.size;

    // --- UPDATE VIEWS ---
    renderTrendChart(filteredData);
    renderRegionChart(filteredData);
    renderTables(globalFormData, mtdData, userRoles);
}

// 3. Render View 1: Trend Line Chart
function renderTrendChart(data) {
    let dateMap = {};
    
    // Group by Date and Form Type
    data.forEach(row => {
        let date = row['Meeting Date'] || row['Audit Date'] || (row['Submitted At'] ? row['Submitted At'].split('T')[0] : 'Unknown');
        let type = row['Form Type']; // '1-1 & Training' or 'Audits'
        
        if (!dateMap[date]) dateMap[date] = { audit: 0, meeting: 0 };
        
        if (type === 'Audits') dateMap[date].audit++;
        else dateMap[date].meeting++;
    });

    let sortedDates = Object.keys(dateMap).sort();
    let auditData = sortedDates.map(d => dateMap[d].audit);
    let meetingData = sortedDates.map(d => dateMap[d].meeting);

    const ctx = document.getElementById('trendChartCanvas').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy(); // Clear old chart
    
    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates,
            datasets: [
                { label: 'Audits', data: auditData, borderColor: '#a855f7', tension: 0.3, fill: false },
                { label: '1-1 Training', data: meetingData, borderColor: '#3b82f6', tension: 0.3, fill: false }
            ]
        }
    });
}

// 4. Render View 2: Region Bar Chart
function renderRegionChart(data) {
    let regionMap = {};
    
    data.forEach(row => {
        let region = row['Region (1-1)'] || row['Region (Audit)'] || 'Unknown';
        regionMap[region] = (regionMap[region] || 0) + 1;
    });

    let regions = Object.keys(regionMap);
    let regionCounts = regions.map(r => regionMap[r]);

    const ctx = document.getElementById('regionChartCanvas').getContext('2d');
    if (regionChartInstance) regionChartInstance.destroy(); // Clear old chart
    
    regionChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: regions,
            datasets: [{
                label: 'Total Submissions',
                data: regionCounts,
                backgroundColor: '#22c55e',
                borderRadius: 4
            }]
        }
    });
}

// 5. Render View 3 & Summary Table
function renderTables(allData, mtdData, userRoles) {
    let userStats = {};
    
    // Calculate Overall Submissions
    allData.forEach(row => {
        let email = (row['Submitted By'] || 'Unknown').toLowerCase().trim();
        if(!userStats[email]) userStats[email] = { email: email, role: (userRoles[email] || 'Unknown').toUpperCase(), overall: 0, mtd: 0 };
        userStats[email].overall++;
    });
    
    // Calculate MTD Submissions
    mtdData.forEach(row => {
        let email = (row['Submitted By'] || 'Unknown').toLowerCase().trim();
        if(userStats[email]) userStats[email].mtd++;
    });

    let usersArray = Object.values(userStats);
    
    // --- Populate Main Summary Table (All Users) ---
    let summaryHtml = '';
    usersArray.sort((a, b) => b.overall - a.overall).forEach(u => {
        summaryHtml += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 10px;">${u.email}</td>
                <td style="padding: 10px;">${u.role}</td>
                <td style="padding: 10px; font-weight: bold;">${u.overall}</td>
                <td style="padding: 10px; color: var(--accent-blue);">${u.mtd}</td>
            </tr>
        `;
    });
    document.getElementById('mainSummaryBody').innerHTML = summaryHtml;

    // --- Populate Top and Bottom 10 Tables ---
    let eligibleRoles = ['BH', 'CL', 'RCL', 'CM'];
    let filteredUsers = usersArray.filter(u => eligibleRoles.includes(u.role));
    
    let top10 = filteredUsers.slice(0, 10);
    let bottom10 = filteredUsers.slice().reverse().slice(0, 10);

    let buildRows = (arr) => {
        return arr.map(u => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 10px;"><b>${u.email}</b><br><small style="color: gray;">${u.role}</small></td>
                <td style="padding: 10px; font-weight: bold;">${u.overall}</td>
                <td style="padding: 10px;">${u.mtd}</td>
            </tr>
        `).join('');
    };

    document.getElementById('top10Body').innerHTML = buildRows(top10);
    document.getElementById('bottom10Body').innerHTML = buildRows(bottom10);
}

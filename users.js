/* ============================================
   CADENCE REPORT - Dynamic User Database
   Fetches live data from Google Sheets
   Default password: Acer@1234
   ============================================ */

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQhEE5FyHnRTYqr6UDh8vGyW6sxal-nEAg2ZfhCH_VtrWIQ0OsO9I2pJa92sduhUJ9R1wV_MJF4Y-oN/pub?output=csv';
const DEFAULT_PASSWORD = 'Acer@1234';

// Role hierarchy mapping
const ROLE_MAP = {
    'CL': 'cl',      // Center Lead
    'CM': 'cl',      // Center Manager -> mapped to CL
    'RCL': 'rcl',    // Regional Center Lead
    'BH': 'bh',      // Branch Head
    'RBH': 'rbh'     // Regional Branch Head
};

const ROLE_LABELS = {
    admin: 'Administrator',
    rbh: 'Regional Branch Head',
    rcl: 'Regional Center Lead',
    bh: 'Branch Head',
    cl: 'Center Lead'
};

// Cache for sheet data
let _sheetDataCache = null;
let _sheetDataTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch and parse CSV from Google Sheets
 */
async function fetchSheetData() {
    const now = Date.now();
    
    // Return cache if valid
    if (_sheetDataCache && (now - _sheetDataTimestamp) < CACHE_DURATION) {
        return _sheetDataCache;
    }

    try {
        const response = await fetch(SHEET_CSV_URL);
        if (!response.ok) throw new Error('Failed to fetch sheet');
        
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        _sheetDataCache = rows;
        _sheetDataTimestamp = now;
        
        // Store in localStorage for offline fallback
        localStorage.setItem('cadence-sheet-data', JSON.stringify(rows));
        localStorage.setItem('cadence-sheet-timestamp', now.toString());
        
        return rows;
    } catch (error) {
        console.error('Sheet fetch error:', error);
        
        // Try to load from localStorage cache
        const cached = localStorage.getItem('cadence-sheet-data');
        if (cached) {
            return JSON.parse(cached);
        }
        
        throw error;
    }
}

/**
 * Parse CSV text into array of objects
 */
function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length >= headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] ? values[index].trim() : '';
            });
            data.push(row);
        }
    }
    
    return data;
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current);
    return result;
}

/**
 * Build users database from sheet data
 */
async function buildUsersDatabase() {
    const rows = await fetchSheetData();
    const users = {};
    
    // First pass: collect all unique emails from hierarchy columns
    const hierarchyEmails = new Set();
    
    rows.forEach(row => {
        const rbhEmail = row.RBH ? row.RBH.toLowerCase().trim() : '';
        const rclEmail = row.RCL ? row.RCL.toLowerCase().trim() : '';
        const bhEmail = row.BH ? row.BH.toLowerCase().trim() : '';
        
        if (rbhEmail && rbhEmail !== '-' && rbhEmail !== '') hierarchyEmails.add(rbhEmail);
        if (rclEmail && rclEmail !== '-' && rclEmail !== '') hierarchyEmails.add(rclEmail);
        if (bhEmail && bhEmail !== '-' && bhEmail !== '') hierarchyEmails.add(bhEmail);
    });
    
    // Create users from sheet rows (CL/CM)
    rows.forEach(row => {
        const email = row.mail_id ? row.mail_id.toLowerCase().trim() : '';
        if (!email) return;
        
        const employeeType = row.employee_type ? row.employee_type.toUpperCase() : 'CL';
        const role = ROLE_MAP[employeeType] || 'cl';
        
        // Extract name from email
        const name = email.split('@')[0]
            .replace(/[._]/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        users[email] = {
            password: DEFAULT_PASSWORD,
            name: name,
            role: role,
            region: row.Region || '',
            vertical: row.Vertical || '',
            center: row.Center || '',
            rcl: row.RCL ? row.RCL.toLowerCase().trim() : null,
            bh: row.BH ? row.BH.toLowerCase().trim() : null,
            rbh: row.RBH ? row.RBH.toLowerCase().trim() : null,
            isDefaultPassword: true,
            createdAt: new Date().toISOString()
        };
    });
    
    // Add hierarchy users (RBH, RCL, BH) if not already present
    rows.forEach(row => {
        const rbhEmail = row.RBH ? row.RBH.toLowerCase().trim() : '';
        const rclEmail = row.RCL ? row.RCL.toLowerCase().trim() : '';
        const bhEmail = row.BH ? row.BH.toLowerCase().trim() : '';
        
        // Add RBH
        if (rbhEmail && rbhEmail !== '-' && !users[rbhEmail]) {
            const name = rbhEmail.split('@')[0]
                .replace(/[._]/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            
            users[rbhEmail] = {
                password: DEFAULT_PASSWORD,
                name: name,
                role: 'rbh',
                region: row.Region || '',
                vertical: row.Vertical || '',
                center: null,
                rcl: null,
                bh: null,
                rbh: null,
                isDefaultPassword: true,
                createdAt: new Date().toISOString()
            };
        }
        
        // Add RCL
        if (rclEmail && rclEmail !== '-' && !users[rclEmail]) {
            const name = rclEmail.split('@')[0]
                .replace(/[._]/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            
            users[rclEmail] = {
                password: DEFAULT_PASSWORD,
                name: name,
                role: 'rcl',
                region: row.Region || '',
                vertical: row.Vertical || '',
                center: null,
                rcl: null,
                bh: null,
                rbh: rbhEmail,
                isDefaultPassword: true,
                createdAt: new Date().toISOString()
            };
        }
        
        // Add BH
        if (bhEmail && bhEmail !== '-' && !users[bhEmail]) {
            const name = bhEmail.split('@')[0]
                .replace(/[._]/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            
            users[bhEmail] = {
                password: DEFAULT_PASSWORD,
                name: name,
                role: 'bh',
                region: row.Region || '',
                vertical: row.Vertical || '',
                center: null,
                rcl: rclEmail,
                bh: null,
                rbh: rbhEmail,
                isDefaultPassword: true,
                createdAt: new Date().toISOString()
            };
        }
    });
    
    return users;
}

/**
 * Authenticate user with email and password
 */
async function authenticateUser(email, password) {
    const users = await buildUsersDatabase();
    const user = users[email.toLowerCase().trim()];
    
    if (!user) {
        return { success: false, error: 'No account found with this email' };
    }
    
    // Check if password matches (either default or changed)
    if (user.password !== password) {
        return { success: false, error: 'Incorrect password. Please try again.' };
    }
    
    return {
        success: true,
        user: {
            email: email.toLowerCase().trim(),
            ...user
        }
    };
}

/**
 * Check if user needs to change password (first login with default)
 */
async function needsPasswordChange(email) {
    const users = await buildUsersDatabase();
    const user = users[email.toLowerCase().trim()];
    return user && user.isDefaultPassword;
}

/**
 * Change user password
 */
async function changeUserPassword(email, newPassword) {
    const users = await buildUsersDatabase();
    const normalizedEmail = email.toLowerCase().trim();
    
    if (users[normalizedEmail]) {
        users[normalizedEmail].password = newPassword;
        users[normalizedEmail].isDefaultPassword = false;
        
        // Save updated users to localStorage
        localStorage.setItem('cadence-users', JSON.stringify(users));
        
        return { success: true };
    }
    
    return { success: false, error: 'User not found' };
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
    const users = await buildUsersDatabase();
    return users[email.toLowerCase().trim()] || null;
}

/**
 * Get all users
 */
async function getAllUsers() {
    return await buildUsersDatabase();
}

/**
 * Get users by role
 */
async function getUsersByRole(role) {
    const users = await buildUsersDatabase();
    return Object.entries(users)
        .filter(([_, user]) => user.role === role)
        .map(([email, user]) => ({ email, ...user }));
}

/**
 * Get hierarchy for a user
 */
async function getUserHierarchy(email) {
    const users = await buildUsersDatabase();
    const user = users[email.toLowerCase().trim()];
    
    if (!user) return null;
    
    const hierarchy = {
        user: user,
        rcl: user.rcl ? users[user.rcl] : null,
        bh: user.bh ? users[user.bh] : null,
        rbh: user.rbh ? users[user.rbh] : null
    };
    
    return hierarchy;
}

/**
 * Generate OTP for password reset
 */
function generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Send OTP (simulated - in production, integrate with email service)
 */
async function sendOTP(email, otp) {
    // In production, this would send an actual email
    // For demo, we'll store it and show it
    localStorage.setItem('cadence-otp', JSON.stringify({
        email: email,
        otp: otp,
        timestamp: Date.now()
    }));
    
    return { success: true, message: `OTP sent to ${email}` };
}

/**
 * Verify OTP
 */
function verifyOTP(email, enteredOTP) {
    const stored = JSON.parse(localStorage.getItem('cadence-otp') || '{}');
    
    if (stored.email !== email) {
        return { success: false, error: 'Invalid OTP request' };
    }
    
    if (stored.otp !== enteredOTP) {
        return { success: false, error: 'Invalid OTP' };
    }
    
    // Check if OTP is expired (5 minutes)
    if (Date.now() - stored.timestamp > 5 * 60 * 1000) {
        return { success: false, error: 'OTP expired' };
    }
    
    // Clear used OTP
    localStorage.removeItem('cadence-otp');
    
    return { success: true };
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SHEET_CSV_URL,
        DEFAULT_PASSWORD,
        ROLE_MAP,
        ROLE_LABELS,
        fetchSheetData,
        buildUsersDatabase,
        authenticateUser,
        needsPasswordChange,
        changeUserPassword,
        getUserByEmail,
        getAllUsers,
        getUsersByRole,
        getUserHierarchy,
        generateOTP,
        sendOTP,
        verifyOTP
    };
}

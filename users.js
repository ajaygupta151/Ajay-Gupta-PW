/* ============================================
   CADENCE REPORT - Dynamic User Database
   Fetches live data from Google Sheets
   Default password: Acer@1234
   ============================================ */

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQhEE5FyHnRTYqr6UDh8vGyW6sxal-nEAg2ZfhCH_VtrWIQ0OsO9I2pJa92sduhUJ9R1wV_MJF4Y-oN/pub?output=csv';
const DEFAULT_PASSWORD = 'Acer@1234';

// ============================================
// SHEET 2 — ROLES & PASSWORDS (source of truth)
// --------------------------------------------
// The hierarchy/roles sheet ("Sheet2" tab) of the login spreadsheet.
// Every id whose role column says "admin" (any case) gets full admin access.
// Columns: mail_id, role, role_label, password
// ============================================
const SHEET2_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQhEE5FyHnRTYqr6UDh8vGyW6sxal-nEAg2ZfhCH_VtrWIQ0OsO9I2pJa92sduhUJ9R1wV_MJF4Y-oN/pub?gid=1181913691&single=true&output=csv';

// ============================================
// ADMIN ACCESS CONFIGURATION
// --------------------------------------------
// Admin IDs get FULL access: all regions, all
// RBHs, all centers — overall visibility.
//
// Two ways to make a user Admin:
//   1. Add their email to ADMIN_EMAILS below, OR
//   2. Set employee_type = "ADMIN" for that row
//      in the Google Sheet.
// ============================================
const ADMIN_EMAILS = [
    // 'admin@pw.live',
    // 'virender.singh@pw.live',
];

// Role hierarchy mapping
const ROLE_MAP = {
    'CL': 'cl',      // Center Lead
    'CM': 'cl',      // Center Manager -> mapped to CL
    'RCL': 'rcl',    // Regional Center Lead
    'BH': 'bh',      // Branch Head
    'RBH': 'rbh',    // Regional Branch Head
    'ADMIN': 'admin' // Administrator (full access)
};

/**
 * Check if an email should be treated as Admin
 */
function isAdminEmail(email) {
    if (!email) return false;
    const normalized = email.toLowerCase().trim();
    return ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(normalized);
}

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

// Cache for Sheet2 (roles/passwords)
let _sheet2DataCache = null;
let _sheet2DataTimestamp = 0;

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
 * Fetch Sheet2 (roles/passwords tab). Returns [] when not configured.
 */
async function fetchSheet2Data() {
    if (!SHEET2_CSV_URL) return [];
    const now = Date.now();
    if (_sheet2DataCache && (now - _sheet2DataTimestamp) < CACHE_DURATION) {
        return _sheet2DataCache;
    }
    try {
        const response = await fetch(SHEET2_CSV_URL);
        if (!response.ok) throw new Error('Failed to fetch sheet2');
        const rows = parseCSV(await response.text());
        _sheet2DataCache = rows;
        _sheet2DataTimestamp = now;
        return rows;
    } catch (error) {
        console.error('Sheet2 fetch error:', error);
        const cached = localStorage.getItem('cadence-sheet2-data');
        return cached ? JSON.parse(cached) : [];
    }
}

/**
 * Pick a cell from a row by any of the given header names (case-insensitive).
 */
function pickCol(row, names) {
    if (!row) return '';
    const lower = {};
    for (const k of Object.keys(row)) lower[k.toLowerCase().trim()] = row[k];
    for (const n of names) {
        const v = lower[String(n).toLowerCase().trim()];
        if (v !== undefined && v !== '') return v;
    }
    return '';
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

    // ---- ADMIN OVERRIDE ----
    // Emails listed in ADMIN_EMAILS get the 'admin' role (full access),
    // regardless of what the sheet says. Create the entry if missing.
    ADMIN_EMAILS.forEach(email => {
        const normalized = email.toLowerCase().trim();
        if (!normalized) return;
        if (!users[normalized]) {
            const name = normalized.split('@')[0]
                .replace(/[._]/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            users[normalized] = {
                password: DEFAULT_PASSWORD,
                name: name,
                role: 'admin',
                region: '',
                vertical: '',
                center: null,
                rcl: null,
                bh: null,
                rbh: null,
                isDefaultPassword: true,
                createdAt: new Date().toISOString()
            };
        } else {
            users[normalized].role = 'admin';
        }
    });

    // ---- SHEET2 OVERRIDE (roles + passwords source of truth) ----
    // The hierarchy sheet decides every role. Any id whose role column says
    // "admin" (any case) gets full admin access — no hardcoded list.
    let sheet2Rows = [];
    try {
        sheet2Rows = await fetchSheet2Data();
    } catch (e) {
        sheet2Rows = [];
    }
    if (sheet2Rows.length > 0) {
        const knownRoles = ['admin', 'rbh', 'rcl', 'bh', 'cl'];
        sheet2Rows.forEach(row => {
            const email = pickCol(row, ['mail_id', 'mail id', 'mailid', 'email', 'email id']).toLowerCase().trim();
            if (!email) return;
            const roleVal = pickCol(row, ['role', 'employee_type', 'employee type', 'designation', 'user role']);
            const passVal = pickCol(row, ['password', 'pass', 'pass word']);

            if (!users[email]) {
                const name = email.split('@')[0]
                    .replace(/[._]/g, ' ')
                    .split(' ')
                    .filter(Boolean)
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');
                users[email] = {
                    password: passVal || DEFAULT_PASSWORD,
                    name: name,
                    role: 'cl',
                    region: '',
                    vertical: '',
                    center: null,
                    rcl: null,
                    bh: null,
                    rbh: null,
                    isDefaultPassword: true,
                    createdAt: new Date().toISOString()
                };
            }

            if (roleVal) {
                const up = String(roleVal).toUpperCase().trim();
                let newRole = ROLE_MAP[up] || String(roleVal).toLowerCase().trim();
                if (!knownRoles.includes(newRole)) newRole = 'cl';
                users[email].role = newRole;
            }
            if (passVal) users[email].password = passVal;
        });

        // ---- STRICT SHEET2 LOGIN ----
        // ONLY the ids listed in Sheet2 can log in — their id + password from
        // that sheet. Sheet1-only hierarchy ids (which would otherwise get the
        // default password) are removed, so nobody logs in unless listed here.
        const allowedEmails = new Set(
            sheet2Rows
                .map(row => pickCol(row, ['mail_id', 'mail id', 'mailid', 'email', 'email id']).toLowerCase().trim())
                .filter(Boolean)
        );
        Object.keys(users).forEach(email => {
            if (!allowedEmails.has(email)) delete users[email];
        });
    }

    // ---- LOCALLY-CHANGED PASSWORDS ----
    // Passwords changed via Settings/changeUserPassword are persisted in
    // localStorage ('cadence-users'); apply them last so a manual password
    // change always wins over the sheet value.
    try {
        const saved = localStorage.getItem('cadence-users');
        if (saved) {
            const savedUsers = JSON.parse(saved);
            Object.keys(savedUsers).forEach(email => {
                if (users[email] && savedUsers[email] && savedUsers[email].password) {
                    users[email].password = savedUsers[email].password;
                    users[email].isDefaultPassword = false;
                }
            });
        }
    } catch (e) {
        console.warn('cadence-users override failed:', e);
    }
    
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

// ============================================
// OTP EMAIL — Apps Script Web App URL
// --------------------------------------------
// Deploy the included otp-mail.gs as a Google
// Apps Script Web App ("Anyone" access), then
// paste the /exec URL here:
//   https://script.google.com/macros/s/XXXXX/exec
// OTP mails are sent from the Apps Script
// owner's Gmail account.
// ============================================
const OTP_MAIL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwGaN9ljjI2mm3xcx3hQporN6cbZ7KqzBYUInrb9_2yaiIIKKFMIiuN6zYVhmk2Z_qBOw/exec'; // e.g. 'https://script.google.com/macros/s/XXXXX/exec'

/**
 * Generate OTP for password reset
 */
function generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Send OTP email to the user via Apps Script endpoint.
 * Falls back to a console/dev hint when no endpoint is configured.
 */
async function sendOTP(email, otp, purpose = 'password-reset') {
    // Always store locally for verification
    localStorage.setItem('cadence-otp', JSON.stringify({
        email: email,
        otp: otp,
        timestamp: Date.now()
    }));

    if (OTP_MAIL_ENDPOINT) {
        try {
            const response = await fetch(OTP_MAIL_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'send', email, otp, purpose })
            });
            // Apps Script web apps send Access-Control-Allow-Origin: *,
            // so we can read the real response (no need for no-cors).
            const data = await response.json().catch(() => ({}));
            if (data.success === false) {
                console.error('OTP email send failed:', data.message);
                return { success: false, error: data.message || 'Could not send OTP email. Please try again.' };
            }
            return { success: true, message: `OTP sent to ${email}` };
        } catch (error) {
            console.error('OTP email send failed:', error);
            return { success: false, error: 'Could not send OTP email. Please try again.' };
        }
    }

    // No endpoint configured yet — show OTP in console for dev/testing only
    console.warn('[CADENCE] OTP_MAIL_ENDPOINT not configured. OTP for ' + email + ':', otp);
    return { success: true, message: `OTP sent to ${email}` };
}

/**
 * Verify OTP (local check). On success, notifies the Apps Script
 * endpoint so the OTP Log sheet row is marked VERIFIED.
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

    // Notify server so the OTP Log sheet row gets marked VERIFIED
    if (OTP_MAIL_ENDPOINT) {
        fetch(OTP_MAIL_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'verify', email, otp: enteredOTP })
        }).catch(() => {});
    }
    
    return { success: true };
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SHEET_CSV_URL,
        DEFAULT_PASSWORD,
        ADMIN_EMAILS,
        OTP_MAIL_ENDPOINT,
        isAdminEmail,
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

/* ============================================
   CADENCE - Google Apps Script
   Sheet1 → Sheet2 User-Role-Password Mapping
   
   Kaise use karna hai:
   1. Google Sheet kholo jismein data hai
   2. Extensions → Apps Script pe jao
   3. Ye code paste karo
   4. "CreateMappingSheet" function run karo
   5. Sheet2 mein mail_id | role | password aa jaayega
   ============================================ */

// ============ CONFIGURATION ============
const DEFAULT_PASSWORD = 'Acer@1234';
const SOURCE_SHEET = 'Sheet1';    // Jahan raw data hai
const TARGET_SHEET = 'Sheet2';    // Jahan mapping banega

// Employee type → Role mapping
const ROLE_MAP = {
  'CL':  'cl',    // Center Lead
  'CM':  'cl',    // Center Manager → CL role
  'RCL': 'rcl',   // Regional Center Lead
  'BH':  'bh',    // Branch Head
  'RBH': 'rbh'    // Regional Branch Head
};

const ROLE_LABELS = {
  'cl':  'Center Lead',
  'rcl': 'Regional Center Lead',
  'bh':  'Branch Head',
  'rbh': 'Regional Branch Head'
};

// ============ MAIN FUNCTION ============
function CreateMappingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ---- Source sheet padho ----
  const sourceSheet = ss.getSheetByName(SOURCE_SHEET);
  if (!sourceSheet) {
    SpreadsheetApp.getUi().alert('❌ "' + SOURCE_SHEET + '" nahi mili. Pehle wo sheet banao ya naam check karo.');
    return;
  }
  
  const sourceData = sourceSheet.getDataRange().getValues();
  const headers = sourceData[0].map(h => h.toString().trim());
  
  // Column indices dhundho
  const mailIdx     = headers.findIndex(h => h.toLowerCase() === 'mail_id');
  const empTypeIdx  = headers.findIndex(h => h.toLowerCase() === 'employee_type');
  const regionIdx   = headers.findIndex(h => h.toLowerCase() === 'region');
  const rclIdx      = headers.findIndex(h => h.toLowerCase() === 'rcl');
  const bhIdx       = headers.findIndex(h => h.toLowerCase() === 'bh');
  const rbhIdx      = headers.findIndex(h => h.toLowerCase() === 'rbh');
  
  if (mailIdx === -1) {
    SpreadsheetApp.getUi().alert('❌ "mail_id" column nahi mili. Column name check karo.');
    return;
  }
  
  // ---- Collect karo sab users ----
  const usersMap = {};  // email → {email, role, password, name}
  
  // Pass 1: Regular users (mail_id column se)
  for (let i = 1; i < sourceData.length; i++) {
    const row = sourceData[i];
    const email = (row[mailIdx] || '').toString().trim().toLowerCase();
    if (!email) continue;
    
    let empType = '';
    if (empTypeIdx !== -1) {
      empType = (row[empTypeIdx] || '').toString().trim().toUpperCase();
    }
    
    const role = ROLE_MAP[empType] || 'cl';
    const name = email.split('@')[0]
      .replace(/[._]/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    
    usersMap[email] = {
      email: email,
      role: role,
      password: DEFAULT_PASSWORD,
      name: name
    };
  }
  
  // Pass 2: Hierarchy users (RCL, BH, RBH columns se)
  // Sirf unhe add karo jo abhi tak nahi hain
  for (let i = 1; i < sourceData.length; i++) {
    const row = sourceData[i];
    
    // RCL
    if (rclIdx !== -1) {
      const rclEmail = (row[rclIdx] || '').toString().trim().toLowerCase();
      if (rclEmail && rclEmail !== '-' && !usersMap[rclEmail]) {
        usersMap[rclEmail] = {
          email: rclEmail,
          role: 'rcl',
          password: DEFAULT_PASSWORD,
          name: rclEmail.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        };
      }
    }
    
    // BH
    if (bhIdx !== -1) {
      const bhEmail = (row[bhIdx] || '').toString().trim().toLowerCase();
      if (bhEmail && bhEmail !== '-' && !usersMap[bhEmail]) {
        usersMap[bhEmail] = {
          email: bhEmail,
          role: 'bh',
          password: DEFAULT_PASSWORD,
          name: bhEmail.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        };
      }
    }
    
    // RBH
    if (rbhIdx !== -1) {
      const rbhEmail = (row[rbhIdx] || '').toString().trim().toLowerCase();
      if (rbhEmail && rbhEmail !== '-' && !usersMap[rbhEmail]) {
        usersMap[rbhEmail] = {
          email: rbhEmail,
          role: 'rbh',
          password: DEFAULT_PASSWORD,
          name: rbhEmail.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        };
      }
    }
  }
  
  // ---- Target sheet banao ya clear karo ----
  let targetSheet = ss.getSheetByName(TARGET_SHEET);
  if (targetSheet) {
    targetSheet.clearContents();
  } else {
    targetSheet = ss.insertSheet(TARGET_SHEET);
  }
  
  // ---- Headers likho ----
  const outHeaders = ['mail_id', 'role', 'role_label', 'password'];
  targetSheet.getRange(1, 1, 1, outHeaders.length).setValues([outHeaders]);
  
  // Header formatting
  const headerRange = targetSheet.getRange(1, 1, 1, outHeaders.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#3b82f6');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  
  // ---- Data likho ----
  const usersArray = Object.values(usersMap).sort((a, b) => {
    // Role wise sort: rbh → rcl → bh → cl
    const order = { rbh: 0, rcl: 1, bh: 2, cl: 3 };
    const diff = (order[a.role] || 9) - (order[b.role] || 9);
    if (diff !== 0) return diff;
    return a.email.localeCompare(b.email);
  });
  
  if (usersArray.length === 0) {
    SpreadsheetApp.getUi().alert('⚠️ Koi user nahi mila. Sheet1 mein data check karo.');
    return;
  }
  
  const outData = usersArray.map(u => [
    u.email,
    u.role,
    ROLE_LABELS[u.role] || u.role,
    u.password
  ]);
  
  targetSheet.getRange(2, 1, outData.length, outHeaders.length).setValues(outData);
  
  // Column widths adjust karo
  targetSheet.setColumnWidth(1, 250);  // mail_id
  targetSheet.setColumnWidth(2, 80);   // role
  targetSheet.setColumnWidth(3, 180);  // role_label
  targetSheet.setColumnWidth(4, 140);  // password
  
  // Border lagao
  if (outData.length > 0) {
    targetSheet.getRange(1, 1, outData.length + 1, outHeaders.length)
      .setBorder(true, true, true, true, true, true);
  }
  
  // Freeze header row
  targetSheet.setFrozenRows(1);
  
  // ---- Summary message ----
  const roleCounts = {};
  usersArray.forEach(u => {
    roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
  });
  
  let summary = '✅ Sheet2 ban gayi!\n\n';
  summary += '📊 Total Users: ' + usersArray.length + '\n\n';
  summary += 'Role-wise breakdown:\n';
  Object.keys(roleCounts).sort().forEach(role => {
    summary += '  • ' + (ROLE_LABELS[role] || role) + ': ' + roleCounts[role] + '\n';
  });
  summary += '\n🔑 Default Password: ' + DEFAULT_PASSWORD;
  summary += '\n\nSheet2 dekho — mail_id | role | role_label | password';
  
  SpreadsheetApp.getUi().alert(summary);
}


// ============ AUTOMATIC REFRESH (Trigger lagao) ============
// Jab bhi Sheet1 mein data change ho, Sheet2 auto-update ho
// Isko manually ek baar run karo, phir trigger khud lagega

function CreateAutoRefreshTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetId = ss.getSheetByName(SOURCE_SHEET)?.getSheetId();
  
  if (!sheetId) {
    SpreadsheetApp.getUi().alert('❌ Source sheet nahi mili.');
    return;
  }
  
  // Purane triggers hatao
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'OnSheetEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Naya trigger lagao — jab bhi Sheet1 edit ho
  ScriptApp.newTrigger('OnSheetEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  
  SpreadsheetApp.getUi().alert('✅ Auto-refresh trigger lag gaya!\n\nAb jab bhi Sheet1 mein kuch change karoge, Sheet2 automatically update ho jayegi.');
}

function OnSheetEdit(e) {
  const editedSheet = e.source.getActiveSheet();
  if (editedSheet.getName() === SOURCE_SHEET) {
    CreateMappingSheet();
  }
}


// ============ LOOKUP HELPER (Web App ke liye) ============
// Agar tumhe kisi email ka role/password chahiye to ye use karo

function GetUserByEmail(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET);
  
  if (!targetSheet) {
    CreateMappingSheet();  // Pehle bana do agar nahi hai
  }
  
  const sheet = ss.getSheetByName(TARGET_SHEET);
  const data = sheet.getDataRange().getValues();
  const emailLower = email.toLowerCase().trim();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase().trim() === emailLower) {
      return {
        email: data[i][0],
        role: data[i][1],
        roleLabel: data[i][2],
        password: data[i][3]
      };
    }
  }
  
  return null;
}


// ============ MENU (Sheet khulte hai dikhe) ============
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔑 CADENCE User Manager')
    .addItem('Sheet2 banao / Update karo', 'CreateMappingSheet')
    .addItem('Auto-Refresh Trigger lagao', 'CreateAutoRefreshTrigger')
    .addToUi();
}

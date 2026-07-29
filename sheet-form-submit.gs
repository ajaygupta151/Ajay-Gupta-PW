/* ============================================
   CADENCE - Form Submission Web App
   Counselling Cadence form → "Form Responses" tab
   Deployed at: https://script.google.com/macros/s/AKfycbyCL_Sh0wjtmSLy1aun02yuVD1TljUE65lty3aJKcFFgx_G8NMvDPA6NUiVL43B-HRA/exec
   ============================================ */

// ============ CONFIGURATION ============
const FORM_RESPONSES_SHEET = 'Form Responses';

// All column headers in fixed order
const ALL_HEADERS = [
  { key: 'entry.44403739',   header: 'Form Type' },
  { key: 'entry.1585165027', header: 'Region (1-1)' },
  { key: 'entry.1799437018', header: 'Center (1-1)' },
  { key: 'entry.1735151396', header: 'Meeting Date' },
  { key: 'entry.103869035',  header: 'Meeting Type' },
  { key: 'entry.1434137606', header: 'Meeting Attendees' },
  { key: 'entry.888636433',  header: 'Discussion Summary/MOM' },
  { key: 'entry.1394845977', header: 'Recording Link' },
  { key: 'entry.379018411',  header: 'Region (Audit)' },
  { key: 'entry.2040980163', header: 'Center (Audit)' },
  { key: 'entry.670486697',  header: 'Audit Date' },
  { key: 'entry.1782082718', header: 'Lead Link' },
  { key: 'entry.863311867',  header: 'Counsellor Email' },
  { key: 'entry.163400271',  header: 'Audit Remarks' },
  { key: 'entry.173305894',  header: 'Audit Score' },
  { key: 'submitted_by',     header: 'Submitted By' },
  { key: 'submitted_at',     header: 'Submitted At' }
];

// ============ DO POST (Web App Entry Point) ============
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const result = saveFormResponse(data);
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============ DO GET (Web App — health check + data) ============
function doGet(e) {
  try {
    // ?action=responses → return all form responses
    if (e && e.parameter && e.parameter.action === 'responses') {
      return getFormResponses();
    }
    
    // Default: health check
    return ContentService
      .createTextOutput(JSON.stringify({ 
        status: 'ok', 
        message: 'CADENCE Form Submission Web App is running',
        sheet: FORM_RESPONSES_SHEET
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============ SAVE FORM RESPONSE ============
function saveFormResponse(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // "Form Responses" sheet dhundho ya banao
  let sheet = ss.getSheetByName(FORM_RESPONSES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(FORM_RESPONSES_SHEET);
    sheet.setFrozenRows(1);
  }
  
  // Entry fields (form data entries)
  const entries = {};
  
  // Form type
  entries['entry.44403739'] = data.formType || '';
  
  if (data.formType === '1-1 & Training') {
    entries['entry.1585165027'] = data.meetingRegion || '';
    entries['entry.1799437018'] = data.meetingCenter || '';
    entries['entry.1735151396'] = data.meetingDate || '';
    entries['entry.103869035'] = data.meetingType || '';
    entries['entry.1434137606'] = data.meetingAttendees || '';
    entries['entry.888636433'] = data.meetingSummary || '';
    entries['entry.1394845977'] = data.meetingRecording || '';
  } else if (data.formType === 'Audits') {
    entries['entry.379018411'] = data.auditRegion || '';
    entries['entry.2040980163'] = data.auditCenter || '';
    entries['entry.670486697'] = data.auditDate || '';
    entries['entry.1782082718'] = data.auditLeadLink || '';
    entries['entry.863311867'] = data.auditCounsellor || '';
    entries['entry.163400271'] = data.auditRemarks || '';
    entries['entry.173305894'] = data.auditScore || '';
  }
  
  entries['submitted_by'] = data.submittedBy || '';
  entries['submitted_at'] = data.submittedAt || new Date().toISOString();
  
  // =========== SIMPLIFIED APPROACH ===========
  // ALL_HEADERS defined at top of file
  
  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  
  // Column index map: header name → column number (1-based)
  let colMap = {};
  
  if (lastColumn === 0) {
    // Sheet is empty — write header row first
    const headerRow = ALL_HEADERS.map(h => h.header);
    sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow])
      .setFontWeight('bold')
      .setBackground('#3b82f6')
      .setFontColor('#ffffff');
    
    // Build colMap: header name → 0-based index
    ALL_HEADERS.forEach((h, idx) => {
      colMap[h.header] = idx;
    });
  } else {
    // Read existing headers
    const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    
    // Build colMap from existing headers
    existingHeaders.forEach((header, idx) => {
      colMap[header] = idx;
    });
    
    // Add any missing headers
    let newColsAdded = false;
    ALL_HEADERS.forEach(h => {
      if (colMap[h.header] === undefined) {
        const newCol = existingHeaders.length + Object.keys(colMap).filter(k => {
          // Count how many were originally in existingHeaders vs added
          return existingHeaders.indexOf(k) === -1;
        }).length;
        // Simpler approach: append the new column
        const appendCol = lastColumn + 1;
        sheet.getRange(1, appendCol).setValue(h.header);
        colMap[h.header] = appendCol - 1; // 0-based
        existingHeaders.push(h.header);
        newColsAdded = true;
      }
    });
  }
  
  // Build data row
  const totalCols = Math.max(lastColumn, ALL_HEADERS.length);
  const rowData = new Array(totalCols).fill('');
  
  // Map entries to columns using colMap
  ALL_HEADERS.forEach(h => {
    const colIdx = colMap[h.header];
    if (colIdx !== undefined && colIdx < totalCols && entries[h.key] !== undefined) {
      rowData[colIdx] = entries[h.key];
    }
  });
  
  // Write the row
  const targetRow = lastRow === 0 ? 2 : lastRow + 1;
  sheet.getRange(targetRow, 1, 1, totalCols).setValues([rowData]);
  
  return { 
    success: true, 
    message: 'Form response saved successfully!',
    row: targetRow
  };
}

// ============ GET FORM RESPONSES (for summary dashboard) ============
function getFormResponses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(FORM_RESPONSES_SHEET);
  
  if (!sheet || sheet.getLastRow() < 2) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, data: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  // Read headers
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  // Read all data rows
  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const dataValues = dataRange.getValues();
  
  // Build array of row objects
  const rows = [];
  dataValues.forEach(row => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx];
    });
    rows.push(obj);
  });
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data: rows }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ TEST FUNCTION (Run from editor) ============
function testSaveFormResponse() {
  const testData = {
    formType: '1-1 & Training',
    meetingRegion: 'Delhi + HR',
    meetingCenter: 'Delhi - Dwarka Vidyapeeth',
    meetingDate: '28/07/2026',
    meetingType: 'One on One',
    meetingAttendees: 'test@test.com',
    meetingSummary: 'Test meeting',
    meetingRecording: '',
    submittedBy: 'test.user@pw.live'
  };
  
  const result = saveFormResponse(testData);
  Logger.log(JSON.stringify(result));
}

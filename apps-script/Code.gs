/**
 * Health Tracker API
 *
 * This is a spreadsheet-bound Google Apps Script.
 * The React application sends the spreadsheet ID and a simple API token in each request.
 * No Script Properties are required for this version.
 */

const API_TOKEN = '2276bg7dshba'

const RESOURCE_CONFIG = {
  consultations: {
    sheetName: 'Consultas',
    headers: ['Data', 'Horário', 'Médico', 'Especialidade', 'Local', 'Observações', 'Criado em'],
    fields: ['date', 'time', 'doctor', 'specialty', 'location', 'notes'],
    required: ['date', 'time', 'doctor', 'specialty'],
  },
  exams: {
    sheetName: 'Exames',
    headers: ['Data', 'Nome do exame', 'Resultado resumido', 'Status', 'Observações', 'Criado em'],
    fields: ['date', 'examName', 'resultSummary', 'status', 'notes'],
    required: ['date', 'examName', 'status'],
  },
  medications: {
    sheetName: 'Medicamentos',
    headers: ['Nome', 'Dosagem', 'Horário', 'Data de início', 'Data de término', 'Observações', 'Criado em'],
    fields: ['name', 'dosage', 'schedule', 'startDate', 'endDate', 'notes'],
    required: ['name', 'dosage', 'schedule', 'startDate'],
  },
  weights: {
    sheetName: 'Peso',
    headers: ['Data', 'Peso em kg', 'Observações', 'Criado em'],
    fields: ['date', 'weight', 'notes'],
    required: ['date', 'weight'],
  },
  symptoms: {
    sheetName: 'Sintomas',
    headers: ['Data', 'Descrição', 'Intensidade', 'Observações', 'Criado em'],
    fields: ['date', 'description', 'intensity', 'notes'],
    required: ['date', 'description', 'intensity'],
  },
  bloodPressures: {
    sheetName: 'Pressão',
    headers: ['Data', 'Pressão máxima', 'Pressão mínima', 'Pulso', 'Observações', 'Criado em'],
    fields: ['date', 'systolic', 'diastolic', 'pulse', 'notes'],
    required: ['date', 'systolic', 'diastolic'],
  },
}

/**
 * Receives data from the React application.
 * Do not execute doPost manually in the Apps Script editor.
 */
function doPost(e) {
  try {
    const payload = parseRequestBody(e)
    validateToken(payload.token)
    const spreadsheet = getSpreadsheet(payload.spreadsheetId)

    if (payload.action === 'ping') {
      return createJsonResponse({
        success: true,
        data: {
          message: 'Conexão com o Google Apps Script funcionando.',
          timestamp: getTimestamp(),
        },
      })
    }

    if (payload.action === 'summary') {
      ensureAllSheets(spreadsheet)

      return createJsonResponse({
        success: true,
        data: getDashboardSummary(spreadsheet),
      })
    }

    if (payload.action === 'updateExamStatus') {
      return createJsonResponse({
        success: true,
        message: 'Status do exame atualizado com sucesso.',
        data: updateExamStatus(spreadsheet, payload.row, payload.status),
      })
    }

    if (payload.action === 'update') {
      return createJsonResponse({
        success: true,
        message: 'Registro atualizado com sucesso.',
        data: updateHealthRecord(spreadsheet, payload.resource, payload.row, payload.data),
      })
    }

    if (payload.action === 'delete') {
      return createJsonResponse({
        success: true,
        message: 'Registro excluído com sucesso.',
        data: deleteHealthRecord(spreadsheet, payload.resource, payload.row),
      })
    }

    if (payload.action !== 'create') {
      throw new Error('Ação inválida.')
    }

    const resource = String(payload.resource || '')
    const config = RESOURCE_CONFIG[resource]

    if (!config) {
      throw new Error('Tipo de registro inválido.')
    }

    const data = payload.data
    validateRecord(resource, data, config)

    const lock = LockService.getScriptLock()
    lock.waitLock(10000)

    try {
      const sheet = getOrCreateSheet(spreadsheet, config.sheetName, config.headers)
      const row = buildRow(config, data)
      const nextRow = sheet.getLastRow() + 1

      sheet.getRange(nextRow, 1, 1, row.length).setValues([row])
      SpreadsheetApp.flush()

      return createJsonResponse({
        success: true,
        message: 'Registro salvo com sucesso.',
        data: {
          sheet: config.sheetName,
          row: nextRow,
        },
      })
    } finally {
      lock.releaseLock()
    }
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: getSafeErrorMessage(error),
    })
  }
}

/**
 * Opens a simple status response in the browser.
 */
function doGet() {
  return createJsonResponse({
    success: true,
    data: {
      message: 'Health Tracker API online.',
      timestamp: getTimestamp(),
    },
  })
}

/**
 * Run this function from the Apps Script editor after opening the script through the target spreadsheet.
 * It creates the five tabs and their headers in the spreadsheet bound to this script.
 */
function testConnection() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()

  if (!spreadsheet) {
    throw new Error('Abra este Apps Script a partir da planilha desejada em Extensões > Apps Script.')
  }

  ensureAllSheets(spreadsheet)
  Logger.log('Conexão validada. As abas e os cabeçalhos foram criados com sucesso.')
}

function createJsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON)
}

function parseRequestBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Corpo da requisição não recebido.')
  }

  try {
    return JSON.parse(e.postData.contents)
  } catch (error) {
    throw new Error('JSON inválido.')
  }
}

function validateToken(token) {
  if (!API_TOKEN || API_TOKEN === 'PASTE_THE_SAME_TOKEN_USED_IN_VITE_API_TOKEN_HERE') {
    throw new Error('Configure a constante API_TOKEN no Code.gs antes de publicar.')
  }

  if (!token || String(token) !== API_TOKEN) {
    throw new Error('Não autorizado.')
  }
}

function getSpreadsheet(spreadsheetId) {
  const id = String(spreadsheetId || '').trim()

  if (!/^[a-zA-Z0-9-_]{20,}$/.test(id)) {
    throw new Error('ID da planilha inválido.')
  }

  try {
    return SpreadsheetApp.openById(id)
  } catch (error) {
    throw new Error('Não foi possível acessar a planilha. Confira o ID e as permissões da conta que publicou o Apps Script.')
  }
}

function ensureAllSheets(spreadsheet) {
  Object.keys(RESOURCE_CONFIG).forEach(function (resource) {
    const config = RESOURCE_CONFIG[resource]
    getOrCreateSheet(spreadsheet, config.sheetName, config.headers)
  })
}

function getOrCreateSheet(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName)

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName)
  }

  ensureHeaders(sheet, headers)
  if (sheetName === RESOURCE_CONFIG.consultations.sheetName) {
    ensureConsultationTimeColumn(sheet)
  }
  return sheet
}

function ensureConsultationTimeColumn(sheet) {
  const secondHeader = String(sheet.getRange(1, 2).getDisplayValue() || '').trim()
  if (secondHeader === 'Horário') return

  sheet.insertColumnAfter(1)
  sheet.getRange(1, 2).setValue('Horário').setFontWeight('bold')
}

function ensureHeaders(sheet, headers) {
  const existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0]
  const isEmpty = existingHeaders.every(function (value) {
    return String(value || '').trim() === ''
  })

  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold')
    sheet.setFrozenRows(1)
    sheet.autoResizeColumns(1, headers.length)
  }
}

function validateRecord(resource, data, config) {
  if (!data || typeof data !== 'object') {
    throw new Error('Dados do registro não recebidos.')
  }

  config.required.forEach(function (field) {
    if (data[field] === undefined || String(data[field]).trim() === '') {
      throw new Error('Preencha o campo obrigatório: ' + getFieldLabel(field) + '.')
    }
  })

  if (resource === 'weights') {
    const weight = Number(String(data.weight).replace(',', '.'))

    if (!isFinite(weight) || weight <= 0) {
      throw new Error('Informe um peso válido maior que zero.')
    }
  }

  if (resource === 'medications' && data.endDate && String(data.endDate) < String(data.startDate)) {
    throw new Error('A data de término não pode ser anterior à data de início.')
  }

  if (resource === 'exams' && ['Pendente', 'Realizado', 'Avaliado'].indexOf(String(data.status)) === -1) {
    throw new Error('Status do exame inválido.')
  }

  if (resource === 'symptoms' && ['Leve', 'Moderada', 'Forte'].indexOf(String(data.intensity)) === -1) {
    throw new Error('Intensidade do sintoma inválida.')
  }

  if (resource === 'bloodPressures') {
    const systolic = Number(data.systolic)
    const diastolic = Number(data.diastolic)
    const pulse = data.pulse ? Number(data.pulse) : null

    if (!isFinite(systolic) || systolic < 50 || systolic > 300) {
      throw new Error('Informe a pressão máxima em mmHg, entre 50 e 300.')
    }
    if (!isFinite(diastolic) || diastolic < 30 || diastolic > 200) {
      throw new Error('Informe a pressão mínima em mmHg, entre 30 e 200.')
    }
    if (systolic <= diastolic) {
      throw new Error('A pressão máxima deve ser maior que a pressão mínima.')
    }
    if (pulse !== null && (!isFinite(pulse) || pulse < 20 || pulse > 250)) {
      throw new Error('Informe o pulso em batimentos por minuto, entre 20 e 250.')
    }
  }
}

function getFieldLabel(field) {
  const labels = {
    date: 'Data',
    doctor: 'Médico',
    time: 'Horário',
    specialty: 'Especialidade',
    examName: 'Nome do exame',
    status: 'Status',
    name: 'Nome do medicamento',
    dosage: 'Dosagem',
    schedule: 'Horário',
    startDate: 'Data de início',
    weight: 'Peso em kg',
    description: 'Descrição do sintoma',
    intensity: 'Intensidade',
    systolic: 'Pressão máxima',
    diastolic: 'Pressão mínima',
  }

  return labels[field] || field
}

function buildRow(config, data) {
  const row = config.fields.map(function (field) {
    if (field === 'weight') {
      return Number(String(data[field]).replace(',', '.'))
    }

    return sanitizeCellValue(data[field])
  })

  row.push(getTimestamp())
  return row
}

function sanitizeCellValue(value) {
  const text = String(value || '').trim()

  // Prevent spreadsheet formulas from being executed when a value starts with a formula character.
  if (/^[=+\-@]/.test(text)) {
    return "'" + text
  }

  return text
}

function getResourceConfig(resourceValue) {
  const resource = String(resourceValue || '')
  const config = RESOURCE_CONFIG[resource]

  if (!config) {
    throw new Error('Tipo de registro inválido.')
  }

  return { resource: resource, config: config }
}

function getValidRecordRow(sheet, rowValue) {
  const row = Number(rowValue)

  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) {
    throw new Error('Este registro não foi encontrado. Atualize o painel e tente novamente.')
  }

  return row
}

function updateHealthRecord(spreadsheet, resourceValue, rowValue, data) {
  const resourceInfo = getResourceConfig(resourceValue)
  validateRecord(resourceInfo.resource, data, resourceInfo.config)
  const sheet = getOrCreateSheet(spreadsheet, resourceInfo.config.sheetName, resourceInfo.config.headers)
  const row = getValidRecordRow(sheet, rowValue)
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)

  try {
    const values = resourceInfo.config.fields.map(function (field) {
      if (field === 'weight') {
        return Number(String(data[field]).replace(',', '.'))
      }

      return sanitizeCellValue(data[field])
    })
    sheet.getRange(row, 1, 1, values.length).setValues([values])
    SpreadsheetApp.flush()
    return { sheet: resourceInfo.config.sheetName, row: row }
  } finally {
    lock.releaseLock()
  }
}

function deleteHealthRecord(spreadsheet, resourceValue, rowValue) {
  const resourceInfo = getResourceConfig(resourceValue)
  const sheet = getOrCreateSheet(spreadsheet, resourceInfo.config.sheetName, resourceInfo.config.headers)
  const row = getValidRecordRow(sheet, rowValue)
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)

  try {
    sheet.deleteRow(row)
    SpreadsheetApp.flush()
    return { sheet: resourceInfo.config.sheetName, row: row }
  } finally {
    lock.releaseLock()
  }
}

function updateExamStatus(spreadsheet, rowValue, statusValue) {
  const row = Number(rowValue)
  const status = String(statusValue || '').trim()

  if (!Number.isInteger(row) || row < 2) {
    throw new Error('Não foi possível identificar o exame escolhido.')
  }

  if (['Pendente', 'Realizado', 'Avaliado'].indexOf(status) === -1) {
    throw new Error('Selecione um status válido para o exame.')
  }

  const sheet = getOrCreateSheet(
    spreadsheet,
    RESOURCE_CONFIG.exams.sheetName,
    RESOURCE_CONFIG.exams.headers,
  )

  const lock = LockService.getScriptLock()
  lock.waitLock(10000)

  try {
    if (row > sheet.getLastRow() || !String(sheet.getRange(row, 2).getDisplayValue()).trim()) {
      throw new Error('Este exame não foi encontrado. Atualize o painel e tente novamente.')
    }

    sheet.getRange(row, 4).setValue(status)
    SpreadsheetApp.flush()

    return {
      row: row,
      status: status,
    }
  } finally {
    lock.releaseLock()
  }
}

function getDashboardSummary(spreadsheet) {
  const today = getTodayIso()
  const consultations = getRows(getOrCreateSheet(spreadsheet, RESOURCE_CONFIG.consultations.sheetName, RESOURCE_CONFIG.consultations.headers))
  const medications = getRows(getOrCreateSheet(spreadsheet, RESOURCE_CONFIG.medications.sheetName, RESOURCE_CONFIG.medications.headers))
  const weights = getRows(getOrCreateSheet(spreadsheet, RESOURCE_CONFIG.weights.sheetName, RESOURCE_CONFIG.weights.headers))
  const exams = getRows(getOrCreateSheet(spreadsheet, RESOURCE_CONFIG.exams.sheetName, RESOURCE_CONFIG.exams.headers))
  const bloodPressures = getRows(getOrCreateSheet(spreadsheet, RESOURCE_CONFIG.bloodPressures.sheetName, RESOURCE_CONFIG.bloodPressures.headers))

  const upcomingConsultations = consultations
    .filter(function (row) {
      return normalizeDate(row[0]) >= today
    })
    .sort(function (first, second) {
      return normalizeDate(first[0]).localeCompare(normalizeDate(second[0]))
    })

  const upcomingConsultationsList = upcomingConsultations.map(formatConsultation)
  const nextConsultation = upcomingConsultationsList.length
    ? upcomingConsultationsList[0]
    : 'Nenhuma agendada'

  const activeMedicationsRows = medications.filter(function (row) {
    const startDate = normalizeDate(row[3])
    const endDate = normalizeDate(row[4])
    return startDate && startDate <= today && (!endDate || endDate >= today)
  })
  const activeMedications = activeMedicationsRows.length
  const activeMedicationsList = activeMedicationsRows.map(formatMedication)

  const sortedWeights = weights
    .slice()
    .reverse()
    .filter(function (row) {
      return normalizeDate(row[0]) && row[1] !== ''
    })
    .sort(function (first, second) {
      return normalizeDate(second[0]).localeCompare(normalizeDate(first[0]))
    })

  const lastWeight = sortedWeights.length
    ? formatWeight(sortedWeights[0][1])
    : 'Sem registro'

  const sortedBloodPressures = bloodPressures
    .slice()
    .reverse()
    .filter(function (row) { return normalizeDate(row[0]) && row[1] !== '' && row[2] !== '' })
    .sort(function (first, second) { return normalizeDate(second[0]).localeCompare(normalizeDate(first[0])) })
  const lastBloodPressure = sortedBloodPressures.length
    ? String(sortedBloodPressures[0][1]) + '/' + String(sortedBloodPressures[0][2]) + ' mmHg'
    : 'Sem registro'

  const pendingExamRows = exams.filter(function (row) {
    return String(row[3] || '').trim() === 'Pendente'
  })
  const pendingExams = pendingExamRows.length
  const pendingExamsList = pendingExamRows.map(formatExam)

  return {
    nextConsultation: nextConsultation,
    upcomingConsultations: upcomingConsultationsList,
    activeMedications: activeMedications,
    activeMedicationsList: activeMedicationsList,
    lastWeight: lastWeight,
    lastBloodPressure: lastBloodPressure,
    pendingExams: pendingExams,
    pendingExamsList: pendingExamsList,
    records: {
      consultations: buildConsultationRecords(consultations),
      exams: buildExamRecords(exams),
      medications: buildMedicationRecords(medications),
      weights: buildWeightRecords(weights),
      symptoms: buildSymptomRecords(
        getRows(getOrCreateSheet(spreadsheet, RESOURCE_CONFIG.symptoms.sheetName, RESOURCE_CONFIG.symptoms.headers)),
      ),
      bloodPressures: buildBloodPressureRecords(bloodPressures),
    },
  }
}

function newestFirst(rows, mapper) {
  return rows.map(function (row, index) {
    return mapper(row, index + 2)
  }).reverse()
}

function buildConsultationRecords(rows) {
  return newestFirst(rows, function (row, rowNumber) {
    return {
      row: rowNumber,
      date: formatDateForDisplay(row[0]),
      time: String(row[1] || '').trim(),
      doctor: String(row[2] || '').trim(),
      specialty: String(row[3] || '').trim(),
      location: String(row[4] || '').trim(),
      notes: String(row[5] || '').trim(),
      createdAt: String(row[6] || '').trim(),
    }
  })
}

function buildExamRecords(rows) {
  return newestFirst(rows, function (row, rowNumber) {
    return {
      row: rowNumber,
      date: formatDateForDisplay(row[0]),
      examName: String(row[1] || '').trim(),
      resultSummary: String(row[2] || '').trim(),
      status: String(row[3] || '').trim(),
      notes: String(row[4] || '').trim(),
      createdAt: String(row[5] || '').trim(),
    }
  })
}

function buildMedicationRecords(rows) {
  return newestFirst(rows, function (row, rowNumber) {
    return {
      row: rowNumber,
      name: String(row[0] || '').trim(),
      dosage: String(row[1] || '').trim(),
      schedule: String(row[2] || '').trim(),
      startDate: formatDateForDisplay(row[3]),
      endDate: formatDateForDisplay(row[4]),
      notes: String(row[5] || '').trim(),
      createdAt: String(row[6] || '').trim(),
    }
  })
}

function buildWeightRecords(rows) {
  return newestFirst(rows, function (row, rowNumber) {
    return {
      row: rowNumber,
      date: formatDateForDisplay(row[0]),
      weight: formatWeight(row[1]),
      notes: String(row[2] || '').trim(),
      createdAt: String(row[3] || '').trim(),
    }
  })
}

function buildSymptomRecords(rows) {
  return newestFirst(rows, function (row, rowNumber) {
    return {
      row: rowNumber,
      date: formatDateForDisplay(row[0]),
      description: String(row[1] || '').trim(),
      intensity: String(row[2] || '').trim(),
      notes: String(row[3] || '').trim(),
      createdAt: String(row[4] || '').trim(),
    }
  })
}

function buildBloodPressureRecords(rows) {
  return newestFirst(rows, function (row, rowNumber) {
    return {
      row: rowNumber,
      date: formatDateForDisplay(row[0]),
      systolic: String(row[1] || '').trim(),
      diastolic: String(row[2] || '').trim(),
      pulse: String(row[3] || '').trim(),
      notes: String(row[4] || '').trim(),
      createdAt: String(row[5] || '').trim(),
    }
  })
}

function formatMedication(row) {
  const name = String(row[0] || '').trim()
  const dosage = String(row[1] || '').trim()
  const schedule = String(row[2] || '').trim()
  const startDate = formatDateForDisplay(row[3])
  const endDate = formatDateForDisplay(row[4])
  const period = startDate ? (endDate ? `${startDate} → ${endDate}` : `${startDate} em diante`) : ''
  return [name, dosage, schedule, period].filter(Boolean).join(' · ')
}

function formatExam(row) {
  const date = formatDateForDisplay(row[0])
  const name = String(row[1] || '').trim()
  const status = String(row[3] || '').trim()
  const parts = [date, name, status].filter(Boolean)
  return parts.join(' — ')
}

function getRows(sheet) {
  const lastRow = sheet.getLastRow()

  if (lastRow < 2) {
    return []
  }

  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues()
}

function formatConsultation(row) {
  const date = formatDateForDisplay(row[0])
  const time = String(row[1] || '').trim()
  const doctor = String(row[2] || '').trim()
  const specialty = String(row[3] || '').trim()
  const details = [doctor, specialty].filter(Boolean).join(' · ')
  const dateAndTime = [date, time].filter(Boolean).join(' às ')

  return details ? dateAndTime + ' — ' + details : dateAndTime
}

function formatWeight(value) {
  const weight = Number(String(value).replace(',', '.'))

  if (!isFinite(weight)) {
    return 'Sem registro'
  }

  return weight.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }) + ' kg'
}

function normalizeDate(value) {
  const text = String(value || '').trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text
  }

  const parsed = new Date(text)

  if (isNaN(parsed.getTime())) {
    return ''
  }

  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd')
}

function formatDateForDisplay(value) {
  const normalized = normalizeDate(value)

  if (!normalized) {
    return ''
  }

  const parts = normalized.split('-')
  return parts[2] + '/' + parts[1] + '/' + parts[0]
}

function getTodayIso() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
}

function getTimestamp() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
}

function getSafeErrorMessage(error) {
  const message = error && error.message ? String(error.message) : 'Erro inesperado.'
  return message.length > 300 ? 'Erro inesperado.' : message
}

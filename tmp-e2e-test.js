const fs = require('fs');
const path = require('path');
const text = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = Object.fromEntries(text.split(/\r?\n/).filter(Boolean).map(line => line.split('=').map(s => s.trim())));
const apiUrl = env.VITE_GOOGLE_APPS_SCRIPT_URL;
const token = env.VITE_API_TOKEN;
const sheetId = env.VITE_GOOGLE_SHEET_ID;
if (!apiUrl || !token || !sheetId) throw new Error('Missing env values');
const today = new Date().toISOString().slice(0, 10);
const records = [
  {action:'create',resource:'consultations',data:{date:today,doctor:'Dra. Silva',specialty:'Cardiologia',location:'Clínica Bem',notes:'Consulta de rotina'}},
  {action:'create',resource:'exams',data:{date:today,examName:'Exame de sangue',resultSummary:'Aguardando',status:'Pendente',notes:'Jejum de 12h'}},
  {action:'create',resource:'medications',data:{name:'Losartana',dosage:'50 mg',schedule:'Manhã',startDate:today,endDate:'',notes:'1 comprimido por dia'}},
  {action:'create',resource:'weights',data:{date:today,weight:'72,3',notes:'Peso da manhã'}},
  {action:'create',resource:'symptoms',data:{date:today,description:'Dor de cabeça leve',intensity:'Leve',notes:'Após caminhar'}}
];
(async () => {
  for (const record of records) {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify({token, spreadsheetId: sheetId, ...record}),
    });
    const text = await res.text();
    console.log(record.resource, res.status, text);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain;charset=utf-8'},
    body: JSON.stringify({token, spreadsheetId: sheetId, action:'summary'}),
  });
  const body = await res.text();
  console.log('SUMMARY', res.status, body);
})();

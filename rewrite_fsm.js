const fs = require('fs');

let fsm = fs.readFileSync('src/conversation/fsm/fsm.ts', 'utf8');

if (!fsm.includes('import { t }')) {
  fsm = fsm.replace("import { isValidEmail", "import { t } from '../../utils/i18n.js';\nimport { isValidEmail");
}

fsm = fsm.replace(
  "const TWO_HOURS_MS = 2 * 60 * 60 * 1000;",
  "const TWO_HOURS_MS = 2 * 60 * 60 * 1000;\n      const metaDataObj = typeof conversation.metadata === 'object' && conversation.metadata !== null ? conversation.metadata : {};\n      const lang = (metaDataObj as any).lang || 'sw';"
);

// We must also pass lang to sendPromptForState
fsm = fsm.replace(/private async sendPromptForState\(state: ConversationState, user: User\) \{/g, "private async sendPromptForState(state: ConversationState, user: User, lang: string = 'sw') {");

fsm = fsm.replace(/this\.sendPromptForState\(([^,]+), user\)/g, "this.sendPromptForState($1, user, lang)");

// Replace strings
const replacements = [
  ["'Mchakato umeghairiwa.'", "t(lang, 'cancelled')"],
  ["'Sikuelewa. / I did not understand.\\n1️⃣ Kiswahili\\n2️⃣ English'", "t(lang, 'invalid_language')"],
  ["'Tafadhali andika jina lako kamili upya (Mfano: John Doe).'", "t(lang, 'ask_name')"],
  ["'Tafadhali andika jina lako kamili (Mfano: John Doe).'", "t(lang, 'ask_name')"],
  ["'Jina si sahihi. Tafadhali tumia herufi tu (Mfano: John Doe).'", "t(lang, 'invalid_name')"],
  ["'Tafadhali andika barua pepe yako (Email).'", "t(lang, 'ask_email')"],
  ["'Mpangilio wa barua pepe si sahihi. Tafadhali jaribu tena.'", "t(lang, 'invalid_email')"],
  ["'Sawa, tuanze kutengeneza CV. Je, unatafuta kazi gani? (Mfano: Mhasibu, Mwalimu)'", "t(lang, 'ask_job_title')"],
  ["'Andika maelezo mafupi (Professional Summary) kukuhusu.'", "t(lang, 'ask_summary')"],
  ["'Tafadhali andika maelezo yenye maana (angalau maneno 3). Mfano: \"Mhasibu mwenye uzoefu...\"'", "t(lang, 'invalid_summary')"],
  ["'Andika maelezo mafupi (Professional Summary) mapya.'", "t(lang, 'ask_summary')"],
  ["'Asante! Tunarekebisha CV yako sasa...'", "t(lang, 'updating')"],
  ["'Sehemu hii haiwezi kuwa wazi. Company Name'", "t(lang, 'invalid_empty')"],
  ["'Company Name'", "t(lang, 'ask_company')"],
  ["'Sehemu hii haiwezi kuwa wazi. Job Title'", "t(lang, 'invalid_empty')"],
  ["'Job Title'", "t(lang, 'ask_exp_job_title')"],
  ["'Work Location (optional) - Type \"skip\" to skip'", "t(lang, 'ask_location')"],
  ["'Employment Type\\nOptions:\\n1️⃣ Full Time\\n2️⃣ Part Time\\n3️⃣ Internship\\n4️⃣ Volunteer\\n5️⃣ Contract'", "t(lang, 'ask_exp_type')"],
  ["'Start Month (e.g., January or 01)'", "t(lang, 'ask_start_month')"],
  ["'Start Year'", "t(lang, 'ask_start_year')"],
  ["'Je, bado unafanya kazi hapa?\\n1️⃣ Ndiyo\\n2️⃣ Hapana'", "t(lang, 'ask_still_working')"],
  ["'End Month (e.g., December or 12)'", "t(lang, 'ask_end_month')"],
  ["'End Year (e.g., 2023)'", "t(lang, 'ask_end_year')"],
  ["'Sehemu hii haiwezi kuwa wazi. Main Responsibilities'", "t(lang, 'invalid_empty')"],
  ["'Tafadhali andika maelezo yenye maana kuhusu majukumu yako (angalau maneno 3).'", "t(lang, 'invalid_responsibilities')"],
  ["'Main Responsibilities (You can write multiple lines)'", "t(lang, 'ask_responsibilities')"],
  ["'Achievements (Optional) - Type \"skip\" to skip'", "t(lang, 'ask_achievements')"],
  ["'Je, unataka kuongeza uzoefu mwingine wa kazi?\\n1️⃣ Ndiyo\\n2️⃣ Hapana'", "t(lang, 'ask_add_another_exp')"],
  ["'Sehemu hii haiwezi kuwa wazi. Institution Name'", "t(lang, 'invalid_empty')"],
  ["'Institution Name'", "t(lang, 'ask_institution')"],
  ["'Sehemu hii haiwezi kuwa wazi. Qualification'", "t(lang, 'invalid_empty')"],
  ["'Qualification'", "t(lang, 'ask_qualification')"],
  ["'Sehemu hii haiwezi kuwa wazi. Field of Study'", "t(lang, 'invalid_empty')"],
  ["'Field of Study'", "t(lang, 'ask_field')"],
  ["'Mwaka sio sahihi. Tafadhali andika mwaka pekee (Mfano: 2022).'", "t(lang, 'invalid_grad_year')"],
  ["'Graduation Year'", "t(lang, 'ask_grad_year')"],
  ["'GPA (Optional) - Type \"skip\" to skip'", "t(lang, 'ask_gpa')"],
  ["'Do you want to add another education?\\n1️⃣ Yes\\n2️⃣ No'", "t(lang, 'ask_add_another_edu')"],
  ["'Sehemu hii haiwezi kuwa wazi. Tafadhali orodhesha ujuzi wako.'", "t(lang, 'invalid_empty')"],
  ["'List your skills separated by commas.\\nExample: Flutter, Laravel, SQL, Linux, Networking'", "t(lang, 'ask_skills')"],
  ["'Sehemu hii haiwezi kuwa wazi. Language Name'", "t(lang, 'invalid_empty')"],
  ["'Language (e.g., English, Swahili)'", "t(lang, 'ask_lang_name')"],
  ["'Proficiency Level\\n1️⃣ Native\\n2️⃣ Fluent\\n3️⃣ Intermediate\\n4️⃣ Beginner'", "t(lang, 'ask_lang_level')"],
  ["'Do you want to add another language?\\n1️⃣ Yes\\n2️⃣ No'", "t(lang, 'ask_add_another_lang')"],
  ["'Sehemu hii haiwezi kuwa wazi. Full Name'", "t(lang, 'invalid_empty')"],
  ["'Reference Full Name'", "t(lang, 'ask_ref_name')"],
  ["'Sehemu hii haiwezi kuwa wazi. Position'", "t(lang, 'invalid_empty')"],
  ["'Reference Position'", "t(lang, 'ask_ref_position')"],
  ["'Sehemu hii haiwezi kuwa wazi. Company'", "t(lang, 'invalid_empty')"],
  ["'Reference Company'", "t(lang, 'ask_ref_company')"],
  ["'Sehemu hii haiwezi kuwa wazi. Phone Number'", "t(lang, 'invalid_empty')"],
  ["'Reference Phone Number'", "t(lang, 'ask_ref_phone')"],
  ["'Sehemu hii haiwezi kuwa wazi. Email Address'", "t(lang, 'invalid_empty')"],
  ["'Reference Email Address'", "t(lang, 'ask_ref_email')"],
  ["'Do you want to add another reference?\\n1️⃣ Yes\\n2️⃣ No'", "t(lang, 'ask_add_another_ref')"],
  ["'Asante! Tunatengeneza CV yako sasa...'", "t(lang, 'processing')"],
  ["'What would you like to do?\\n1️⃣ Generate PDF\\n2️⃣ Edit Section\\n3️⃣ Start Over\\n0️⃣ Main Menu'", "t(lang, 'preview_menu')"],
  ["'Sawa, tunatengeneza PDF ya CV yako...'", "t(lang, 'generating_pdf')"],
  ["'Which section would you like to edit?\\n1 Personal Information\\n2 Professional Summary\\n3 Work Experience\\n4 Education\\n5 Skills\\n6 Languages\\n7 References\\n0 Cancel'", "t(lang, 'edit_menu')"],
  ["'Mchakato wa zamani umefutwa.'", "t(lang, 'old_deleted')"],
  ["'Tafadhali chagua:\\n1️⃣ Endelea\\n2️⃣ Anza Upya'", "t(lang, 'expired_prompt')"],
  ["'Karibu CareerBot 👋\\nPlease choose your language.\\n1️⃣ Kiswahili\\n2️⃣ English'", "t(lang, 'welcome')"],
  ["'Asante! Umesajiliwa kikamilifu. Chagua huduma:\\n1️⃣ Tengeneza CV mpya\\n2️⃣ CV zangu'", "t(lang, 'registered_menu')"],
  ["'Tafadhali endelea.'", "t(lang, 'continue_prompt')"],
  ["'Tafadhali chagua:', [\n              '1️⃣ Endelea',\n              '2️⃣ Anza Upya',\n            ]", "t(lang, 'expired_prompt')"],
];

for (const [search, replace] of replacements) {
  fsm = fsm.split(search).join(replace);
}

fs.writeFileSync('src/conversation/fsm/fsm.ts', fsm);

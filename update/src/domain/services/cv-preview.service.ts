import { CV, User } from '@prisma/client';

export class CvPreviewService {
  buildPreview(user: User, cv: CV): string {
    let preview = '=================================\n';
    preview += 'YOUR CV PREVIEW\n';
    preview += '=================================\n\n';

    // Personal Information
    preview += 'Personal Information\n';
    if (user.fullName) preview += `Full Name: ${user.fullName}\n`;
    if (user.phone) preview += `Phone: ${user.phone}\n`;
    if (user.email) preview += `Email: ${user.email}\n`;
    preview += '\n';

    // Professional Summary
    if (cv.professionalSummary) {
      preview += '----------------------------------------\n';
      preview += 'PROFESSIONAL SUMMARY\n';
      preview += `${cv.professionalSummary}\n\n`;
    }

    // Work Experience
    if (cv.experience && Array.isArray(cv.experience) && cv.experience.length > 0) {
      preview += '----------------------------------------\n';
      preview += 'WORK EXPERIENCE\n\n';
      for (const exp of cv.experience as any[]) {
        if (exp.jobTitle) preview += `${exp.jobTitle.toUpperCase()}\n`;
        if (exp.company) preview += `${exp.company}\n`;
        const start =
          exp.startMonth && exp.startYear
            ? `${exp.startMonth} ${exp.startYear}`
            : exp.startYear || '';
        const end =
          exp.endMonth && exp.endYear ? `${exp.endMonth} ${exp.endYear}` : exp.endYear || '';
        if (start || end) preview += `${start} – ${end || 'Present'}\n`;
        if (exp.location) preview += `${exp.location}\n`;

        if (exp.responsibilities) {
          preview += `\n${exp.responsibilities}\n`;
        }
        if (exp.achievements) {
          preview += `${exp.achievements}\n`;
        }
        preview += '\n';
      }
    }

    // Education
    if (cv.education && Array.isArray(cv.education) && cv.education.length > 0) {
      preview += '----------------------------------------\n';
      preview += 'EDUCATION\n\n';
      for (const edu of cv.education as any[]) {
        if (edu.qualification && edu.field) {
          preview += `${edu.qualification} in ${edu.field}\n`;
        } else if (edu.qualification) {
          preview += `${edu.qualification}\n`;
        }
        if (edu.institution) preview += `${edu.institution}\n`;
        const start = edu.startYear || '';
        const end = edu.gradYear || '';
        if (start || end) preview += `${start} – ${end || 'Present'}\n`;
        if (edu.gpa) preview += `GPA: ${edu.gpa}\n`;
        preview += '\n';
      }
    }

    // Skills
    if (cv.skills) {
      preview += '----------------------------------------\n';
      preview += 'SKILLS\n\n';
      if (Array.isArray(cv.skills)) {
        preview += cv.skills.join('\n') + '\n';
      } else if (typeof cv.skills === 'string') {
        const skillsArray = cv.skills.split(',').map((s) => s.trim());
        preview += skillsArray.join('\n') + '\n';
      }
      preview += '\n';
    }

    // Languages
    if (cv.languages && Array.isArray(cv.languages) && cv.languages.length > 0) {
      preview += '----------------------------------------\n';
      preview += 'LANGUAGES\n\n';
      for (const lang of cv.languages as any[]) {
        preview += `${lang.language} — ${lang.level}\n`;
      }
      preview += '\n';
    }

    // References
    if (cv.references && Array.isArray(cv.references) && cv.references.length > 0) {
      preview += '----------------------------------------\n';
      preview += 'REFERENCES\n\n';
      for (const ref of cv.references as any[]) {
        if (ref.name) preview += `${ref.name}\n`;
        if (ref.position && ref.company) preview += `${ref.position}, ${ref.company}\n`;
        else if (ref.position) preview += `${ref.position}\n`;
        else if (ref.company) preview += `${ref.company}\n`;

        if (ref.phone) preview += `${ref.phone}\n`;
        if (ref.email) preview += `${ref.email}\n`;
        preview += '\n';
      }
    }

    preview += '=================================';
    return preview;
  }
}

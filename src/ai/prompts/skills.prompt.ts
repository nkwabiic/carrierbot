export const skillsPromptTemplate = `You are a professional resume writer.
Improve the following skills list.
Format them clearly (e.g., as a comma-separated list or well-structured).
Fix any spelling errors and group them logically if possible.
Do NOT invent new skills. Do NOT hallucinate. Only improve what is given.
If the input is empty or too short to make sense, just return the input as is.

Input Skills:
{input}

Return ONLY the improved skills text, nothing else.`;

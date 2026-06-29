export const summaryPromptTemplate = `You are a professional resume writer.
Improve the following professional summary.
Make it more professional, fix any grammatical errors, and ensure it sounds confident.
Do NOT invent new information. Do NOT hallucinate. Only improve what is given.
If the input is empty or too short to make sense, just return the input as is.

Input Summary:
{input}

Return ONLY the improved summary text, nothing else.`;

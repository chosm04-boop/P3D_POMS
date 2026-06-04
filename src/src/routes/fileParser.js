const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function extractText(filePath, mimeType) {
  try {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf' || mimeType === 'application/pdf') {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return { text: Buffer.from(data.text, 'utf8').toString('utf8'), pages: data.numpages };
    }

    if (ext === '.docx' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ path: filePath });
      return { text: result.value, pages: null };
    }

    if (ext === '.txt' || mimeType === 'text/plain') {
      const text = fs.readFileSync(filePath, 'utf-8');
      return { text, pages: null };
    }

    // 이미지 파일은 파일명만 반환 (추후 Vision API 연동 가능)
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      return {
        text: `[이미지 파일: ${path.basename(filePath)}]\n이미지 파일은 텍스트 추출이 불가합니다. 내용을 직접 입력해주세요.`,
        pages: null,
        isImage: true,
      };
    }

    return { text: `[지원하지 않는 파일 형식: ${ext}]`, pages: null };
  } catch (err) {
    console.error('텍스트 추출 오류:', err);
    return { text: `[텍스트 추출 실패: ${err.message}]`, pages: null };
  }
}

module.exports = { extractText };

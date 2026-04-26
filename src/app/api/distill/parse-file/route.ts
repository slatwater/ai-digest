import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 单文件解析：multipart/form-data 上传 → 提取纯文本
// 支持：txt / md / json / csv / html → 直接 utf-8 / pdf → pdf-parse / docx → mammoth
// 单文件大小硬上限 25 MB（防止内存爆）
const MAX_BYTES = 25 * 1024 * 1024;

interface ParseResult {
  name: string;
  size: number;
  mime: string;
  content: string;
}

async function parseSingle(file: File): Promise<ParseResult> {
  if (file.size > MAX_BYTES) {
    throw new Error(`文件 ${file.name} 超过 25MB 上限`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();
  const mime = file.type || '';

  // 1) 纯文本类
  if (
    /\.(txt|md|markdown|json|csv|tsv|log|html?|xml|yml|yaml|ts|tsx|js|jsx|py|go|rs|java|cpp|c|h|hpp|sh|bash|zsh|toml|ini|env|sql|css|scss|sass)$/i.test(lowerName)
    || mime.startsWith('text/')
    || mime === 'application/json'
  ) {
    return {
      name: file.name,
      size: file.size,
      mime: mime || 'text/plain',
      content: buffer.toString('utf-8'),
    };
  }

  // 2) PDF（pdf-parse v2：PDFParse 类）
  if (lowerName.endsWith('.pdf') || mime === 'application/pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return {
        name: file.name,
        size: file.size,
        mime: 'application/pdf',
        content: result.text || '',
      };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  // 3) DOCX
  if (
    lowerName.endsWith('.docx')
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const mammoth = (await import('mammoth')).default;
    const { value } = await mammoth.extractRawText({ buffer });
    return {
      name: file.name,
      size: file.size,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: value || '',
    };
  }

  // 4) 旧版 .doc：mammoth 不支持 → 直接拒绝
  if (lowerName.endsWith('.doc')) {
    throw new Error(`不支持 .doc（旧 Word 格式），请另存为 .docx 后重试：${file.name}`);
  }

  // 5) 兜底：当作文本读（不提示错误，让 agent 自行判断内容是否乱码）
  return {
    name: file.name,
    size: file.size,
    mime: mime || 'application/octet-stream',
    content: buffer.toString('utf-8'),
  };
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return Response.json(
      { error: '解析 multipart 失败：' + (e instanceof Error ? e.message : 'unknown') },
      { status: 400 },
    );
  }

  const fileEntries = form.getAll('files').filter((v): v is File => v instanceof File);
  if (fileEntries.length === 0) {
    return Response.json({ error: '缺少 files 字段' }, { status: 400 });
  }

  const results: ParseResult[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const f of fileEntries) {
    try {
      results.push(await parseSingle(f));
    } catch (e) {
      errors.push({
        name: f.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return Response.json({ files: results, errors });
}

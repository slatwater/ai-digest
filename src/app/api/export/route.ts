import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const EXPORT_DIR = join(homedir(), 'Desktop', '研究');

export async function POST(req: NextRequest) {
  const { filename, content } = await req.json() as { filename: string; content: string };
  if (!filename || !content) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 });
  }

  // 清理文件名
  const safe = filename.replace(/[/\\?%*:|"<>]/g, '-');
  const filePath = join(EXPORT_DIR, `${safe}.md`);

  await mkdir(EXPORT_DIR, { recursive: true });
  await writeFile(filePath, content, 'utf-8');

  return NextResponse.json({ path: filePath });
}

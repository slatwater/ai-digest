import { getEntries, getEntry } from '@/lib/storage';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  if (id) {
    const entry = await getEntry(id);
    if (!entry) {
      return Response.json({ error: '条目不存在' }, { status: 404 });
    }
    return Response.json(entry);
  }

  const entries = await getEntries();
  return Response.json(entries);
}

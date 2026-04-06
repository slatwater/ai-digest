/**
 * 回填脚本：对已有的深度研究条目执行 Wiki 编译
 * 用法: npx tsx scripts/backfill-concepts.ts
 */
import { getEntries } from '../src/lib/storage';
import { compileWiki } from '../src/lib/compiler';

async function main() {
  const entries = await getEntries();

  // 只处理有 sources 的条目（深度研究过的）
  const deepEntries = entries.filter(e => e.sources.length > 0 || (e.analysis?.technical && e.analysis.technical.length > 100));
  console.log(`找到 ${deepEntries.length} 条深度研究条目（共 ${entries.length} 条）`);

  for (const entry of deepEntries) {
    console.log(`\n编译: ${entry.title}`);
    try {
      await compileWiki(entry);
    } catch (err) {
      console.error(`  失败:`, err);
    }
  }

  console.log('\n回填完成');
}

main().catch(console.error);

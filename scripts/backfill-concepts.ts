/**
 * 回填脚本：对已有的深度研究条目，将 analysis.concepts 存入 Wiki
 * 用法: npx tsx scripts/backfill-concepts.ts
 */
import { getEntries } from '../src/lib/storage';
import { saveConceptsToWiki } from '../src/lib/compiler';

async function main() {
  const entries = await getEntries();

  // 只处理有 concepts 的条目
  const withConcepts = entries.filter(e => e.analysis?.concepts?.length);
  console.log(`找到 ${withConcepts.length} 条含概念的条目（共 ${entries.length} 条）`);

  for (const entry of withConcepts) {
    console.log(`\n存入 Wiki: ${entry.title} (${entry.analysis.concepts!.length} 个概念)`);
    try {
      await saveConceptsToWiki(entry.analysis.concepts!, entry);
    } catch (err) {
      console.error(`  失败:`, err);
    }
  }

  console.log('\n回填完成');
}

main().catch(console.error);

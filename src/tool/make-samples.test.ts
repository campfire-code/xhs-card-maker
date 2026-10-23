// 生成 samples/ 里的示例文件（只在设置了 MAKE_SAMPLES=1 时运行）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { SAMPLE } from './sample';

it.runIf(process.env.MAKE_SAMPLES === '1')('生成示例文件', () => {
  writeFileSync('samples/示例-上班族早餐.txt', SAMPLE + '\n');
  // 一页正文特别长：用来验证自动缩小字号和自动续页
  const long = Array.from({ length: 16 }, (_, i) => `- 第 ${i + 1} 条：把常用的东西放在顺手的位置，每次用完放回原处，坚持一周就会习惯。`).join('\n');
  writeFileSync('samples/示例-超长正文.txt', `收纳清单 16 条\n---\n清单\n${long}\n`);
});

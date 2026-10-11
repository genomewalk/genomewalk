import fs from "node:fs";
import readline from "node:readline";
import { streamBlocks } from "./bgzf.ts";

export async function* textLines(file: fs.PathLike) {
  const input = fs.createReadStream(file);
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) yield line;
  } finally {
    lines.close();
    input.destroy();
  }
}

export async function* readLines(file: fs.PathLike) {
  const fd = fs.openSync(file, "r");
  const size = fs.fstatSync(fd).size;
  const source = {
    size,
    async slice(start: number, end: number) {
      const buffer = Buffer.alloc(Math.max(0, Math.min(end, size) - start));
      let read = 0;
      while (read < buffer.length) {
        const count = fs.readSync(fd, buffer, read, buffer.length - read, start + read);
        if (!count) break;
        read += count;
      }
      return buffer.subarray(0, read);
    },
  };
  const decoder = new TextDecoder();
  let carry = "";
  try {
    for await (const block of streamBlocks(source)) {
      const lines = (carry + decoder.decode(block.data, { stream: true })).split("\n");
      carry = lines.pop()!;
      for (const line of lines) yield line.replace(/\r$/, "");
    }
    carry += decoder.decode();
    if (carry) yield carry.replace(/\r$/, "");
  } finally {
    fs.closeSync(fd);
  }
}

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// A failed write never truncates the previous usable artifact.
export function atomicWriter(destination: string) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.part`;
  let fd: number | null = fs.openSync(temporary, "wx");
  function close() {
    if (fd !== null) {
      fs.closeSync(fd);
      fd = null;
    }
  }
  return {
    write(bytes: string | Buffer<ArrayBuffer> | NodeJS.ArrayBufferView<ArrayBufferLike>) {
      fs.writeFileSync(fd!, bytes);
    },
    commit() {
      fs.fsyncSync(fd!);
      close();
      fs.renameSync(temporary, destination);
    },
    abort() {
      close();
      fs.rmSync(temporary, { force: true });
    },
  };
}

export function writeAtomic(destination: string, bytes: string | Uint8Array) {
  const writer = atomicWriter(destination);
  try {
    writer.write(bytes);
    writer.commit();
  } catch (error) {
    writer.abort();
    throw error;
  }
}

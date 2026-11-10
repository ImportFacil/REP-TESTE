import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

/** Onde ficam os arquivos enviados (documentos do cadastro e das ordens). */
export const ARMAZENAMENTO = Symbol('ARMAZENAMENTO');

export interface Armazenamento {
  salvar(chave: string, conteudo: Buffer, tipo: string): Promise<void>;
  ler(chave: string): Promise<Buffer>;
}

/** AWS: bucket privado, criptografado e com versões. */
export class ArmazenamentoS3 implements Armazenamento {
  private readonly s3 = new S3Client({});
  constructor(private readonly bucket: string) {}

  async salvar(chave: string, conteudo: Buffer, tipo: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: chave, Body: conteudo, ContentType: tipo }));
  }

  async ler(chave: string): Promise<Buffer> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: chave }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
}

/** Local e testes: uma pasta no disco. */
export class ArmazenamentoLocal implements Armazenamento {
  constructor(private readonly pasta: string) {}

  private caminho(chave: string): string {
    const c = normalize(join(this.pasta, chave));
    if (!c.startsWith(normalize(this.pasta))) throw new Error('Chave inválida.');
    return c;
  }

  async salvar(chave: string, conteudo: Buffer): Promise<void> {
    const c = this.caminho(chave);
    await mkdir(dirname(c), { recursive: true });
    await writeFile(c, conteudo);
  }

  ler(chave: string): Promise<Buffer> {
    return readFile(this.caminho(chave));
  }
}

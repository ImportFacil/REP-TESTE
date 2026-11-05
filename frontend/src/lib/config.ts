/** Configuração lida ao abrir o site (/config.json, gerado no deploy de cada ambiente). */
export interface GrupoCognito {
  regiao: string;
  pool: string;
  client: string;
  dominio: string;
}

export interface ConfigSite {
  ambiente: string;
  api: string;
  auth: 'cognito' | 'dev';
  clientes?: GrupoCognito;
  equipe?: GrupoCognito;
  /** Opcional: erros do site vão para o Sentry. */
  sentryDsn?: string;
}

let promessa: Promise<ConfigSite> | null = null;

export function carregarConfig(): Promise<ConfigSite> {
  promessa ??= fetch('/config.json', { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error('Não foi possível carregar a configuração do site.');
    return r.json();
  });
  return promessa;
}

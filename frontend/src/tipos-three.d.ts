// A three vem com a Globe.gl e não traz tipos; aqui só usamos a esfera de nuvens do globo de rotas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'three' { const THREE: any; export = THREE; }

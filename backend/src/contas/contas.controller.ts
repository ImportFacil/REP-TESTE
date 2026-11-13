import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SoCliente, SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import {
  AlterarEmpresaDto, AlterarUsuarioClienteDto, AlterarUsuarioEquipeDto, CriarEmpresaDto, FiltroEmpresas,
  NovoUsuarioClienteDto, NovoUsuarioEquipeDto,
} from './dto';
import { EmpresasService } from './empresas.service';
import { UsuariosService } from './usuarios.service';

@ApiTags('Conta')
@ApiBearerAuth()
@Controller()
export class EuController {
  constructor(private readonly empresas: EmpresasService) {}

  @Get('eu')
  @ApiOperation({ summary: 'Dados de quem está logado (e da empresa, se for cliente)' })
  async eu(@UsuarioAtual() u: UsuarioAutenticado) {
    const empresa = u.empresaId ? await this.empresas.obter(u.empresaId) : null;
    return { usuario: { id: u.id, origem: u.origem, papel: u.papel, nome: u.nome, email: u.email }, empresa };
  }
}

/** Área do cliente: sempre presa à empresa do usuário logado, nunca a um id vindo da requisição. */
@ApiTags('Cliente · Empresa')
@ApiBearerAuth()
@SoCliente()
@Controller('empresa')
export class EmpresaClienteController {
  constructor(
    private readonly empresas: EmpresasService,
    private readonly usuarios: UsuariosService,
  ) {}

  @Get()
  minhaEmpresa(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.empresas.obter(u.empresaId!);
  }

  @Get('usuarios')
  @SoCliente('aprovador')
  listarUsuarios(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.usuarios.listarDaEmpresa(u.empresaId!);
  }

  @Post('usuarios')
  @SoCliente('aprovador')
  @ApiOperation({ summary: 'Convidar um comprador ou aprovador da própria empresa' })
  convidar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: NovoUsuarioClienteDto, @Ip() ip: string) {
    return this.usuarios.criar({ origem: 'cliente', empresaId: u.empresaId, ...dto }, u, ip);
  }

  @Patch('usuarios/:id')
  @SoCliente('aprovador')
  alterarUsuario(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AlterarUsuarioClienteDto, @Ip() ip: string) {
    return this.usuarios.alterar(id, dto, u, ip, { origem: 'cliente', empresaId: u.empresaId! });
  }
}

@ApiTags('Equipe · Empresas')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/empresas')
export class EquipeEmpresasController {
  constructor(
    private readonly empresas: EmpresasService,
    private readonly usuarios: UsuariosService,
  ) {}

  @Get()
  listar(@Query() f: FiltroEmpresas) {
    return this.empresas.listar(f);
  }

  @Post()
  @SoEquipe('comercial', 'administrador')
  criar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: CriarEmpresaDto, @Ip() ip: string) {
    return this.empresas.criar(dto, u, ip);
  }

  @Get('opcoes')
  opcoes() {
    return this.empresas.opcoes();
  }

  @Get(':id')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.empresas.obter(id);
  }

  @Patch(':id')
  @SoEquipe('comercial', 'administrador')
  alterar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AlterarEmpresaDto, @Ip() ip: string) {
    return this.empresas.alterar(id, dto, u, ip);
  }

  @Get(':id/usuarios')
  listarUsuarios(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuarios.listarDaEmpresa(id);
  }

  @Post(':id/usuarios')
  @SoEquipe('comercial', 'administrador')
  @ApiOperation({ summary: 'Convidar um usuário da empresa cliente (o primeiro costuma ser o aprovador)' })
  convidar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NovoUsuarioClienteDto, @Ip() ip: string) {
    return this.usuarios.criar({ origem: 'cliente', empresaId: id, ...dto }, u, ip);
  }

  @Patch(':id/usuarios/:usuarioId')
  @SoEquipe('comercial', 'administrador')
  alterarUsuario(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() dto: AlterarUsuarioClienteDto,
    @Ip() ip: string,
  ) {
    return this.usuarios.alterar(usuarioId, dto, u, ip, { origem: 'cliente', empresaId: id });
  }
}

@ApiTags('Equipe · Usuários da equipe')
@ApiBearerAuth()
@SoEquipe('administrador')
@Controller('equipe/usuarios')
export class EquipeUsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listarEquipe();
  }

  @Post()
  convidar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: NovoUsuarioEquipeDto, @Ip() ip: string) {
    return this.usuarios.criar({ origem: 'equipe', empresaId: null, ...dto }, u, ip);
  }

  @Patch(':id')
  alterar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AlterarUsuarioEquipeDto, @Ip() ip: string) {
    return this.usuarios.alterar(id, dto, u, ip, { origem: 'equipe' });
  }
}

import { Module } from '@nestjs/common';
import { EmpresaClienteController, EquipeEmpresasController, EquipeUsuariosController, EuController } from './contas.controller';
import { EmpresasService } from './empresas.service';
import { UsuariosService } from './usuarios.service';

/** Módulo "Contas e acesso": empresas, usuários e papéis. */
@Module({
  providers: [EmpresasService, UsuariosService],
  controllers: [EuController, EmpresaClienteController, EquipeEmpresasController, EquipeUsuariosController],
  exports: [EmpresasService, UsuariosService],
})
export class ContasModule {}

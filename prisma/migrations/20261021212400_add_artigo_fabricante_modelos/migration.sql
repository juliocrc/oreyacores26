-- CreateTable
CREATE TABLE "ArtigoJangada" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "validade" DATETIME,
    "referencia" TEXT,
    "codigoFabricante" TEXT,
    "jangadaId" INTEGER NOT NULL,
    "stockId" INTEGER,
    "inspecaoId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArtigoJangada_jangadaId_fkey" FOREIGN KEY ("jangadaId") REFERENCES "Jangada" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArtigoJangada_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ArtigoJangada_inspecaoId_fkey" FOREIGN KEY ("inspecaoId") REFERENCES "Inspecao" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Artigo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "descricao" TEXT,
    "referencia" TEXT,
    "codigoFabricante" TEXT,
    "modelosAplicaveis" TEXT,
    "unit" TEXT DEFAULT 'un',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Colete" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipId" INTEGER,
    "serial" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "tamanho" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Ativo',
    "dataFabrico" TEXT,
    "dataInspecao" TEXT,
    "dataProxInspecao" TEXT,
    "observacoes" TEXT,
    "testePressao" TEXT,
    "testeInsuflacao" TEXT,
    "testeVazamento" TEXT,
    "cilindroRef" TEXT,
    "cilindroLote" TEXT,
    "cilindroValidade" TEXT,
    "pastilhaRef" TEXT,
    "pastilhaLote" TEXT,
    "pastilhaValidade" TEXT,
    "temLuz" BOOLEAN,
    "luzRef" TEXT,
    "luzLote" TEXT,
    "luzValidade" TEXT,
    "apitoRef" TEXT,
    "apitoLote" TEXT,
    "apitoValidade" TEXT,
    "mecanismoInflacao" TEXT,
    "mecanismoValidade" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ColeteComponentHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "coleteId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedById" INTEGER,
    "changedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Epirb" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipId" INTEGER,
    "serial" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "tipo" TEXT,
    "hexId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Ativo',
    "dataInspecao" TEXT,
    "dataProxInspecao" TEXT,
    "dataValidadeBateria" TEXT,
    "ownerName" TEXT,
    "ownerAddress" TEXT,
    "ownerPhone" TEXT,
    "emergencyContact1Name" TEXT,
    "emergencyContact1Phone" TEXT,
    "emergencyContact2Name" TEXT,
    "emergencyContact2Phone" TEXT,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VerificacaoColete" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "coleteId" INTEGER NOT NULL,
    "tecidoExterior" TEXT,
    "colagens" TEXT,
    "zataosVelcro" TEXT,
    "fitasReflectoras" TEXT,
    "sistemaInflacao" TEXT,
    "mecanismoInflacao" TEXT,
    "camaras" TEXT,
    "garrafaCO2" TEXT,
    "tuboInflador" TEXT,
    "dataVerificacao" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectorNome" TEXT,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VerificacaoColete_coleteId_fkey" FOREIGN KEY ("coleteId") REFERENCES "Colete" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificadoColete" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "coleteId" INTEGER NOT NULL,
    "dataCertificado" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataValidade" DATETIME,
    "resultado" TEXT NOT NULL DEFAULT 'Aprovado',
    "emitidoPor" TEXT,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CertificadoColete_coleteId_fkey" FOREIGN KEY ("coleteId") REFERENCES "Colete" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FatoImersao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipId" INTEGER,
    "serial" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "designNo" TEXT,
    "tamanho" TEXT,
    "tipo" TEXT,
    "material" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Ativo',
    "dataFabrico" TEXT,
    "dataInspecao" TEXT,
    "dataProxInspecao" TEXT,
    "intervaloServicoMeses" INTEGER,
    "observacoes" TEXT,
    "luzRef" TEXT,
    "luzLote" TEXT,
    "luzValidade" TEXT,
    "apitoRef" TEXT,
    "apitoLote" TEXT,
    "apitoValidade" TEXT,
    "fechoTipo" TEXT,
    "fechoEstado" TEXT,
    "botasEstado" TEXT,
    "luvasEstado" TEXT,
    "capuzEstado" TEXT,
    "wristSealsEstado" TEXT,
    "buddyLineEstado" TEXT,
    "liftingStropEstado" TEXT,
    "buoyancyEstado" TEXT,
    "testeImpermeabilidade" TEXT,
    "testeFlutuabilidade" TEXT,
    "testeFecho" TEXT,
    "leakMetodo" TEXT,
    "leakPressaoKpa" TEXT,
    "leakResultado" TEXT,
    "codigoBER" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Extintor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipId" INTEGER,
    "serial" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "capacidadeKg" INTEGER,
    "tipoAgente" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Ativo',
    "localizacao" TEXT,
    "dataFabrico" TEXT,
    "dataUltimaRecarga" TEXT,
    "dataProxRecarga" TEXT,
    "dataTesteHidraulico" TEXT,
    "dataProxTesteHidraulico" TEXT,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FatoImersaoComponentHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fatoImersaoId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedById" INTEGER,
    "changedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VerificacaoFatoImersao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fatoImersaoId" INTEGER NOT NULL,
    "tecidoExterior" TEXT,
    "costuras" TEXT,
    "fecho" TEXT,
    "fitasReflectoras" TEXT,
    "capuz" TEXT,
    "botas" TEXT,
    "luvas" TEXT,
    "luz" TEXT,
    "apito" TEXT,
    "impermeabilidade" TEXT,
    "checklistJson" TEXT,
    "leakMetodo" TEXT,
    "leakPressaoInicial" TEXT,
    "leakPressaoFinal" TEXT,
    "leakDeltaP" TEXT,
    "leakUnidade" TEXT DEFAULT 'kPa',
    "leakDuracaoMin" TEXT,
    "leakResultado" TEXT,
    "leakReTest" TEXT,
    "zonasFugaJson" TEXT,
    "resultadoGeral" TEXT,
    "codigoBER" TEXT,
    "motivoBER" TEXT,
    "dataVerificacao" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectorNome" TEXT,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VerificacaoFatoImersao_fatoImersaoId_fkey" FOREIGN KEY ("fatoImersaoId") REFERENCES "FatoImersao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificadoFatoImersao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fatoImersaoId" INTEGER NOT NULL,
    "numeroCertificado" TEXT NOT NULL,
    "dataCertificado" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataValidade" DATETIME,
    "resultado" TEXT NOT NULL DEFAULT 'Aprovado',
    "emitidoPor" TEXT,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CertificadoFatoImersao_fatoImersaoId_fkey" FOREIGN KEY ("fatoImersaoId") REFERENCES "FatoImersao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serviceStationId" INTEGER,
    "nome" TEXT NOT NULL,
    "numeroCliente" TEXT,
    "nif" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "telmovel" TEXT,
    "morada" TEXT,
    "modoPagamento" TEXT,
    "moradaNumero" TEXT,
    "codigoPostal" TEXT,
    "localidade" TEXT,
    "ilha" TEXT,
    "tipoCliente" TEXT,
    "observacoes" TEXT,
    "verificationCode" TEXT,
    "verificationCodeExpires" DATETIME,
    CONSTRAINT "Cliente_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactoInterno" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "categoria" TEXT NOT NULL DEFAULT 'Colaborador',
    "empresa" TEXT,
    "localizacao" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telemovel" TEXT,
    "telefoneFixo" TEXT,
    "extensaoNos" TEXT,
    "extensaoVodafone" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "fonte" TEXT,
    "tecnicoId" INTEGER,
    "serviceStationId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContactoInterno_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ContactoInterno_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceStation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "empresa" TEXT,
    "localizacao" TEXT,
    "morada" TEXT,
    "codigoPostal" TEXT,
    "localidade" TEXT,
    "telefone" TEXT,
    "telefone2" TEXT,
    "email" TEXT,
    "website" TEXT,
    "dgrmCertificado" TEXT,
    "dgrmVerificacao" DATETIME,
    "dgrmValidade" DATETIME,
    "dgrmMarcas" TEXT,
    "prefixo" TEXT,
    "territorioTipo" TEXT NOT NULL DEFAULT 'MAINLAND',
    "regiaoOperacional" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Navio" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serviceStationId" INTEGER,
    "nome" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "ilha" TEXT NOT NULL,
    "tipoPesca" TEXT NOT NULL,
    "tipoNavio" TEXT,
    "comprimentoMetros" REAL,
    "anoConstrucao" INTEGER,
    "potenciaMotorKw" REAL,
    "lotacao" INTEGER,
    "zonaNavegacao" TEXT,
    "estadoNavio" TEXT,
    "dataEstado" DATETIME,
    "proprietario" TEXT,
    "bandeira" TEXT,
    "mmsi" TEXT,
    "imo" TEXT,
    "callSignal" TEXT,
    "lat" REAL,
    "lng" REAL,
    "aisUpdatedAt" DATETIME,
    "hruReferencia" TEXT,
    "hruValidade" TEXT,
    "pirotecnicosBordoJson" TEXT,
    "radarReflector" TEXT,
    "radarReflectorValidade" TEXT,
    "portoRegisto" TEXT,
    "cfr" TEXT,
    "territorioGrupo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "clienteId" INTEGER,
    CONSTRAINT "Navio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Navio_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Agenda" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serviceStationId" INTEGER,
    "nome" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "embarcacoesDePesca" TEXT NOT NULL,
    "tipoPesca" TEXT NOT NULL,
    "lotacao" INTEGER NOT NULL,
    "bandeira" TEXT NOT NULL,
    "clienteId" INTEGER,
    CONSTRAINT "Agenda_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Agenda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgendaEvento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serviceStationId" INTEGER,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "raftSerial" TEXT NOT NULL,
    "responsavel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "type" TEXT NOT NULL DEFAULT 'Inspeção',
    "inspectionType" TEXT NOT NULL DEFAULT 'outro',
    "durationMinutes" INTEGER NOT NULL DEFAULT 210,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 15,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgendaEvento_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PedidoAssistencia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serviceStationId" INTEGER,
    "nome" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "navio" TEXT,
    "jangadaSerial" TEXT,
    "tipoAssistencia" TEXT,
    "descricao" TEXT NOT NULL,
    "dataPreferida" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'zapier',
    "estado" TEXT NOT NULL DEFAULT 'novo',
    "metadados" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CatalogMarcaModelo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "marcaKey" TEXT NOT NULL,
    "modeloKey" TEXT NOT NULL,
    "fabricante" TEXT,
    "origem" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "permissionsOverrideJson" TEXT,
    "activeSessionId" TEXT,
    "googleId" TEXT,
    "image" TEXT,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clienteId" INTEGER,
    CONSTRAINT "User_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Post" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" INTEGER NOT NULL,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Jangada" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serviceStationId" INTEGER,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "launchType" TEXT,
    "painterLength" TEXT,
    "maxStowageHeight" TEXT,
    "dataFabrico" TEXT NOT NULL,
    "packType" TEXT NOT NULL,
    "containerModel" TEXT,
    "containerSize" TEXT,
    "closureStrapsJson" TEXT,
    "capacity" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "shipId" INTEGER,
    "shipNameManual" TEXT,
    "dataInspecao" TEXT,
    "dataProxInspecao" TEXT,
    "ultimoCertificadoNumero" TEXT,
    "certificadoExternoNumero" TEXT,
    "certificadoExternoUrl" TEXT,
    "certificadoNumeroOriginal" TEXT,
    "cylinderSerial" TEXT,
    "cylinderTara" TEXT,
    "cylinderPesoBruto" TEXT,
    "cylinderCo2" TEXT,
    "cylinderN2" TEXT,
    "cylinderDataTeste" TEXT,
    "cylinderDataProxTeste" TEXT,
    "cylinderSistema" TEXT,
    "cylinderCabecaDisparoRef" TEXT,
    "cylinderCabecaDisparoSerial" TEXT,
    "fabricType" TEXT,
    "cylinderCabecaDisparoDescricao" TEXT,
    "cylinderTuboCamaraSuperiorRef" TEXT,
    "cylinderTuboCamaraSuperiorDescricao" TEXT,
    "cylinderTuboCamaraInferiorRef" TEXT,
    "cylinderTuboCamaraInferiorDescricao" TEXT,
    "cylinderAcessoriosCamaraSuperiorJson" TEXT,
    "cylinderAcessoriosCamaraInferiorJson" TEXT,
    "cylindersJson" TEXT,
    "testeCamarasJson" TEXT,
    "valvulasAlivio" TEXT,
    "valvulasAtestar" TEXT,
    "hruReferencia" TEXT,
    "hruDataInstalacao" TEXT,
    "hruValidade" TEXT,
    "hruSerial" TEXT,
    "radarReflector" TEXT,
    "radarReflectorValidade" TEXT,
    "tuboIdentificacao" TEXT,
    "numeroObra" TEXT,
    "testeWP" TEXT,
    "testeNAP" TEXT,
    "testeFS" TEXT,
    "testeGI" TEXT,
    "testeDL" TEXT,
    "testeTemperaturaCamaraSuperior" TEXT,
    "testeTemperaturaCamaraInferior" TEXT,
    "testePressaoCamaraSuperior" TEXT,
    "testePressaoCamaraInferior" TEXT,
    "testeWPUnidadePressao" TEXT,
    "testeWPInstrumento" TEXT,
    "testeWPHoraInicio" TEXT,
    "testeWPHoraFim" TEXT,
    "testeWPTemperaturaInicial" TEXT,
    "testeWPTemperaturaFinal" TEXT,
    "testeWPPressaoAtmosfericaInicial" TEXT,
    "testeWPPressaoAtmosfericaFinal" TEXT,
    "testeWPCamaraSuperiorInicio" TEXT,
    "testeWPCamaraSuperiorFim" TEXT,
    "testeWPCamaraSuperiorQueda" TEXT,
    "testeWPCamaraInferiorInicio" TEXT,
    "testeWPCamaraInferiorFim" TEXT,
    "testeWPCamaraInferiorQueda" TEXT,
    "oficinaTemperatura" TEXT,
    "oficinaHumidade" TEXT,
    "serviceBulletinsAppliedJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "certificadoAtivoId" INTEGER,
    "signatureBase64" TEXT,
    "syncSnapshot" TEXT,
    CONSTRAINT "Jangada_certificadoAtivoId_fkey" FOREIGN KEY ("certificadoAtivoId") REFERENCES "CertificadoExtraido" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Jangada_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificadoExtraido" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fileName" TEXT NOT NULL,
    "certificadoNumero" TEXT,
    "sourceYear" INTEGER NOT NULL DEFAULT 2025,
    "raftSerial" TEXT,
    "shipName" TEXT,
    "dataInspecao" TEXT,
    "dataProxInspecao" TEXT,
    "emergencyPackType" TEXT,
    "hasQuadro" BOOLEAN NOT NULL DEFAULT false,
    "validitiesCount" INTEGER NOT NULL DEFAULT 0,
    "isMaisRecente" BOOLEAN NOT NULL DEFAULT false,
    "aplicadoComoAtivo" BOOLEAN NOT NULL DEFAULT false,
    "cylinderData" JSONB,
    "shipOwner" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CertificadoExtraido_raftSerial_fkey" FOREIGN KEY ("raftSerial") REFERENCES "Jangada" ("serial") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificadoValidade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "certificadoId" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "validade" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CertificadoValidade_certificadoId_fkey" FOREIGN KEY ("certificadoId") REFERENCES "CertificadoExtraido" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "referencia" TEXT NOT NULL,
    "serviceStationId" INTEGER,
    "descricao" TEXT NOT NULL,
    "estadoArtigo" TEXT NOT NULL DEFAULT 'ATIVO',
    "referenciaSubstituta" TEXT,
    "categoria" TEXT,
    "associavelJangada" BOOLEAN NOT NULL DEFAULT false,
    "aplicavelMarcaJangada" TEXT,
    "aplicavelModeloJangada" TEXT,
    "precoCompra" REAL,
    "codigoFabricante" TEXT,
    "inventario" TEXT,
    "lote" TEXT,
    "validade" TEXT,
    "testeHidraulico" TEXT,
    "estadoCargaCilindro" TEXT,
    "precoVenda" REAL NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "quantidadeMinima" INTEGER,
    "quantidadeReservada" INTEGER NOT NULL DEFAULT 0,
    "leadTimeDias" INTEGER,
    "foto" TEXT,
    "localizacao" TEXT,
    "unit" TEXT DEFAULT 'un',
    "observacoes" TEXT,
    "codigoBarras" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Stock_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomPackType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomPackType_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomPackType_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomPackTypeItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customPackTypeId" INTEGER NOT NULL,
    "stockId" INTEGER,
    "stockReference" TEXT NOT NULL,
    "stockDescription" TEXT NOT NULL,
    "stockCategory" TEXT,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomPackTypeItem_customPackTypeId_fkey" FOREIGN KEY ("customPackTypeId") REFERENCES "CustomPackType" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomPackTypeItem_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovimentacaoStock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stockId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "quantidadeAntes" INTEGER NOT NULL,
    "quantidadeDepois" INTEGER NOT NULL,
    "motivo" TEXT,
    "usuario" TEXT,
    "ordemServicoId" INTEGER,
    "inspecaoId" INTEGER,
    "pedidoReposicaoId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimentacaoStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MovimentacaoStock_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MovimentacaoStock_inspecaoId_fkey" FOREIGN KEY ("inspecaoId") REFERENCES "Inspecao" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MovimentacaoStock_pedidoReposicaoId_fkey" FOREIGN KEY ("pedidoReposicaoId") REFERENCES "PedidoReposicao" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PedidoReposicao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numero" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "fornecedor" TEXT,
    "notas" TEXT,
    "criadoPor" TEXT,
    "serviceStationId" INTEGER,
    "totalEstimado" REAL NOT NULL DEFAULT 0,
    "encomendadoEm" DATETIME,
    "recebidoEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PedidoReposicaoLinha" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedidoId" INTEGER NOT NULL,
    "stockId" INTEGER,
    "referencia" TEXT,
    "descricao" TEXT NOT NULL,
    "fornecedor" TEXT,
    "quantidadePedida" INTEGER NOT NULL,
    "quantidadeRecebida" INTEGER NOT NULL DEFAULT 0,
    "precoUnitario" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PedidoReposicaoLinha_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoReposicao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PedidoReposicaoLinha_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Inspecao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "certificadoNumero" TEXT NOT NULL,
    "navioNome" TEXT NOT NULL,
    "navioId" INTEGER,
    "jangadaId" INTEGER,
    "jangadaSerial" TEXT,
    "coleteId" INTEGER,
    "coleteSerial" TEXT,
    "dataInspecao" TEXT NOT NULL,
    "dataProxInspecao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Concluída',
    "sourceFile" TEXT,
    "signatureBase64" TEXT,
    "clienteAssinaturaBase64" TEXT,
    "clienteNomeAssinatura" TEXT,
    "guiaTransporteUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "numeroObra" TEXT,
    "testeWP" TEXT,
    "testeNAP" TEXT,
    "testeFS" TEXT,
    "testeGI" TEXT,
    "testeDL" TEXT,
    "testeWPUnidadePressao" TEXT,
    "testeWPInstrumento" TEXT,
    "testeWPHoraInicio" TEXT,
    "testeWPHoraFim" TEXT,
    "testeWPTemperaturaInicial" TEXT,
    "testeWPTemperaturaFinal" TEXT,
    "testeWPPressaoAtmosfericaInicial" TEXT,
    "testeWPPressaoAtmosfericaFinal" TEXT,
    "testeWPCamaraSuperiorInicio" TEXT,
    "testeWPCamaraSuperiorFim" TEXT,
    "testeWPCamaraSuperiorQueda" TEXT,
    "testeWPCamaraInferiorInicio" TEXT,
    "testeWPCamaraInferiorFim" TEXT,
    "testeWPCamaraInferiorQueda" TEXT,
    "oficinaTemperatura" TEXT,
    "oficinaHumidade" TEXT,
    "orcamento" JSONB,
    "checklistSnapshot" JSONB,
    "integrityHash" TEXT,
    "integrityTimestamp" DATETIME,
    "integrityVersion" INTEGER
);

-- CreateTable
CREATE TABLE "OrdemServico" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numeroOrdem" TEXT NOT NULL,
    "serviceStationId" INTEGER,
    "jangadaId" INTEGER,
    "shipId" INTEGER,
    "clienteId" INTEGER,
    "tecnicoId" INTEGER,
    "inspecaoId" INTEGER,
    "pedidoAssistenciaId" INTEGER,
    "tipo" TEXT NOT NULL DEFAULT 'inspecao',
    "prioridade" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "descricao" TEXT,
    "tecnicoResponsavel" TEXT,
    "slaHoras" INTEGER,
    "dataPlaneadaInicio" DATETIME,
    "dataPlaneadaFim" DATETIME,
    "dataAbertura" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataPrevista" DATETIME,
    "dataInicio" DATETIME,
    "dataConclusao" DATETIME,
    "durationMinutes" INTEGER NOT NULL DEFAULT 210,
    "orcamentoStatus" TEXT NOT NULL DEFAULT 'Rascunho',
    "isPesca" BOOLEAN NOT NULL DEFAULT false,
    "isIsentoIva" BOOLEAN NOT NULL DEFAULT false,
    "codigoIsencaoIva" TEXT,
    "valorPecas" REAL NOT NULL DEFAULT 0,
    "valorMaoObra" REAL NOT NULL DEFAULT 0,
    "valorDesconto" REAL NOT NULL DEFAULT 0,
    "valorTotal" REAL NOT NULL DEFAULT 0,
    "metadados" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrdemServico_jangadaId_fkey" FOREIGN KEY ("jangadaId") REFERENCES "Jangada" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrdemServico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrdemServico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrdemServico_inspecaoId_fkey" FOREIGN KEY ("inspecaoId") REFERENCES "Inspecao" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrdemServico_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrdemServico_pedidoAssistenciaId_fkey" FOREIGN KEY ("pedidoAssistenciaId") REFERENCES "PedidoAssistencia" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdemServicoJangada" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ordemServicoId" INTEGER NOT NULL,
    "jangadaId" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrdemServicoJangada_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrdemServicoJangada_jangadaId_fkey" FOREIGN KEY ("jangadaId") REFERENCES "Jangada" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tecnico" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serviceStationId" INTEGER,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tecnico_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TecnicoAusencia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tecnicoKey" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataInicio" DATETIME NOT NULL,
    "dataFim" DATETIME NOT NULL,
    "motivo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tecnicoId" INTEGER,
    CONSTRAINT "TecnicoAusencia_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdemServicoChecklistItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ordemServicoId" INTEGER NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'pre',
    "category" TEXT,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "barcode" TEXT,
    "scannedAt" DATETIME,
    "photoUrl" TEXT,
    "notes" TEXT,
    "isDefect" BOOLEAN NOT NULL DEFAULT false,
    "originalDiagramRef" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrdemServicoChecklistItem_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrdemServicoChecklistItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdemServicoTempo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ordemServicoId" INTEGER NOT NULL,
    "tecnicoId" INTEGER,
    "tecnico" TEXT,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrdemServicoTempo_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrdemServicoTempo_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdemServicoLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ordemServicoId" INTEGER NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL DEFAULT 'EVENT',
    "message" TEXT NOT NULL,
    "user" TEXT,
    "tecnicoId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrdemServicoLog_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrdemServicoLog_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fatura" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numeroFatura" TEXT NOT NULL,
    "clienteId" INTEGER,
    "shipId" INTEGER,
    "valorSubtotal" REAL NOT NULL DEFAULT 0,
    "valorIva" REAL NOT NULL DEFAULT 0,
    "valorTotal" REAL NOT NULL DEFAULT 0,
    "isIsentoIva" BOOLEAN NOT NULL DEFAULT false,
    "codigoIsencaoIva" TEXT,
    "pagamentoStatus" TEXT NOT NULL DEFAULT 'Pendente',
    "dataEmissao" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidaPor" TEXT,
    "metadados" TEXT,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "dataCancelamento" DATETIME,
    "motivoCancelamento" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fatura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FaturaOrdemServico" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "faturaId" INTEGER NOT NULL,
    "ordemServicoId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FaturaOrdemServico_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FaturaOrdemServico_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotaCredito" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numeroNotaCredito" TEXT NOT NULL,
    "faturaId" INTEGER NOT NULL,
    "valorTotal" REAL NOT NULL DEFAULT 0,
    "dataEmissao" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidaPor" TEXT,
    "motivo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotaCredito_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recibo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numeroRecibo" TEXT NOT NULL,
    "faturaId" INTEGER NOT NULL,
    "valorPago" REAL NOT NULL DEFAULT 0,
    "pagamentoStatus" TEXT NOT NULL DEFAULT 'Pago',
    "dataEmissao" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidaPor" TEXT,
    "metadados" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recibo_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Equipamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "serial" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Ativo',
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ServiceStationQueue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serviceStationId" INTEGER,
    "jangadaId" INTEGER NOT NULL,
    "ordemServicoId" INTEGER,
    "dataChegada" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataPrevistaEntrega" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Aguardando',
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceStationQueue_jangadaId_fkey" FOREIGN KEY ("jangadaId") REFERENCES "Jangada" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceStationQueue_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ServiceStationQueue_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tabela" TEXT NOT NULL,
    "tipoOperacao" TEXT NOT NULL,
    "idRegisto" INTEGER NOT NULL,
    "descricao" TEXT,
    "usuario" TEXT,
    "dadosAntes" TEXT,
    "dadosDepois" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CertificacaoFabricanteTecnico" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tecnicoId" INTEGER NOT NULL,
    "fabricante" TEXT NOT NULL,
    "numeroCertificado" TEXT,
    "dataEmissao" DATETIME NOT NULL,
    "dataValidade" DATETIME NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CertificacaoFabricanteTecnico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalibracaoEquipamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serviceStationId" INTEGER,
    "nome" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataCalibracao" DATETIME NOT NULL,
    "dataProxCalibracao" DATETIME NOT NULL,
    "certificadoNum" TEXT,
    "certificadoUrl" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CalibracaoHistorico" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "calibracaoId" INTEGER,
    "serviceStationId" INTEGER,
    "nome" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataCalibracao" DATETIME NOT NULL,
    "dataProxCalibracao" DATETIME NOT NULL,
    "certificadoNum" TEXT,
    "certificadoUrl" TEXT,
    "observacoes" TEXT,
    "registadoPor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalibracaoHistorico_calibracaoId_fkey" FOREIGN KEY ("calibracaoId") REFERENCES "CalibracaoEquipamento" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovimentoEquipamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipoEquipamento" TEXT NOT NULL,
    "equipamentoId" INTEGER NOT NULL,
    "serial" TEXT NOT NULL,
    "origemShipId" INTEGER,
    "origemShipNome" TEXT,
    "destinoShipId" INTEGER,
    "destinoShipNome" TEXT,
    "data" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT
);

-- CreateTable
CREATE TABLE "Recall" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fabricante" TEXT NOT NULL,
    "modeloPattern" TEXT,
    "serialPattern" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "acaoRequerida" TEXT NOT NULL,
    "gravidade" TEXT NOT NULL,
    "dataPublicacao" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ativo" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Custo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "data" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "serviceStationId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "contacto" TEXT,
    "email" TEXT,
    "morada" TEXT,
    "pais" TEXT DEFAULT 'Portugal',
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrdemCompra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numero" TEXT NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Rascunho',
    "dataEncomenda" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataPrevista" DATETIME,
    "dataRecebimento" DATETIME,
    "valorTotal" REAL NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "serviceStationId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrdemCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdemCompraLinha" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ordemCompraId" INTEGER NOT NULL,
    "stockId" INTEGER,
    "referencia" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidadeEncomendada" INTEGER NOT NULL,
    "quantidadeRecebida" INTEGER NOT NULL DEFAULT 0,
    "precoUnitario" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "OrdemCompraLinha_ordemCompraId_fkey" FOREIGN KEY ("ordemCompraId") REFERENCES "OrdemCompra" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrdemCompraLinha_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comunicacao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" TEXT NOT NULL,
    "canal" TEXT,
    "destinatario" TEXT,
    "assunto" TEXT,
    "mensagem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enviado',
    "erro" TEXT,
    "providerId" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 1,
    "proximaTentativa" DATETIME,
    "respondidoEm" DATETIME,
    "refTipo" TEXT,
    "refId" INTEGER,
    "clienteId" INTEGER,
    "jangadaId" INTEGER,
    "ordemServicoId" INTEGER,
    "enviadoPor" TEXT,
    "enviadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DeclaracaoIsencaoIva" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numeroSequencial" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "numeroCompleto" TEXT NOT NULL,
    "clienteNome" TEXT,
    "clienteNif" TEXT,
    "navioNome" TEXT,
    "navioMatricula" TEXT,
    "codigoIsencaoIva" TEXT,
    "origem" TEXT,
    "emitidoPorId" TEXT,
    "dataEmissao" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PortoEscala" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "navioNome" TEXT NOT NULL,
    "matricula" TEXT,
    "tipoCarga" TEXT,
    "armador" TEXT,
    "cais" TEXT,
    "dataChegada" DATETIME,
    "dataPartida" DATETIME,
    "origemDestino" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Previsto',
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NavioContentorRoute" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "navioNome" TEXT NOT NULL,
    "imo" TEXT,
    "operador" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "frequencia" TEXT,
    "capacidadeTeus" INTEGER,
    "diasEscala" TEXT,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImportacaoIaExemplo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "documentKind" TEXT,
    "extractedJson" TEXT NOT NULL,
    "correctedJson" TEXT NOT NULL,
    "jangadaId" INTEGER,
    "shipId" INTEGER,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ArtigoJangada_stockId_idx" ON "ArtigoJangada"("stockId");

-- CreateIndex
CREATE INDEX "ArtigoJangada_jangadaId_idx" ON "ArtigoJangada"("jangadaId");

-- CreateIndex
CREATE INDEX "Artigo_name_idx" ON "Artigo"("name");

-- CreateIndex
CREATE INDEX "Artigo_referencia_idx" ON "Artigo"("referencia");

-- CreateIndex
CREATE INDEX "Artigo_codigoFabricante_idx" ON "Artigo"("codigoFabricante");

-- CreateIndex
CREATE UNIQUE INDEX "Colete_serial_key" ON "Colete"("serial");

-- CreateIndex
CREATE INDEX "Colete_shipId_idx" ON "Colete"("shipId");

-- CreateIndex
CREATE INDEX "Colete_estado_idx" ON "Colete"("estado");

-- CreateIndex
CREATE INDEX "Colete_dataProxInspecao_idx" ON "Colete"("dataProxInspecao");

-- CreateIndex
CREATE INDEX "ColeteComponentHistory_coleteId_idx" ON "ColeteComponentHistory"("coleteId");

-- CreateIndex
CREATE INDEX "ColeteComponentHistory_fieldName_idx" ON "ColeteComponentHistory"("fieldName");

-- CreateIndex
CREATE INDEX "ColeteComponentHistory_createdAt_idx" ON "ColeteComponentHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Epirb_serial_key" ON "Epirb"("serial");

-- CreateIndex
CREATE INDEX "Epirb_shipId_idx" ON "Epirb"("shipId");

-- CreateIndex
CREATE INDEX "Epirb_estado_idx" ON "Epirb"("estado");

-- CreateIndex
CREATE INDEX "Epirb_tipo_idx" ON "Epirb"("tipo");

-- CreateIndex
CREATE INDEX "Epirb_dataProxInspecao_idx" ON "Epirb"("dataProxInspecao");

-- CreateIndex
CREATE INDEX "Epirb_marca_modelo_idx" ON "Epirb"("marca", "modelo");

-- CreateIndex
CREATE INDEX "VerificacaoColete_coleteId_idx" ON "VerificacaoColete"("coleteId");

-- CreateIndex
CREATE INDEX "VerificacaoColete_dataVerificacao_idx" ON "VerificacaoColete"("dataVerificacao");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoColete_coleteId_key" ON "CertificadoColete"("coleteId");

-- CreateIndex
CREATE INDEX "CertificadoColete_coleteId_idx" ON "CertificadoColete"("coleteId");

-- CreateIndex
CREATE INDEX "CertificadoColete_dataCertificado_idx" ON "CertificadoColete"("dataCertificado");

-- CreateIndex
CREATE UNIQUE INDEX "FatoImersao_serial_key" ON "FatoImersao"("serial");

-- CreateIndex
CREATE INDEX "FatoImersao_shipId_idx" ON "FatoImersao"("shipId");

-- CreateIndex
CREATE INDEX "FatoImersao_estado_idx" ON "FatoImersao"("estado");

-- CreateIndex
CREATE INDEX "FatoImersao_dataProxInspecao_idx" ON "FatoImersao"("dataProxInspecao");

-- CreateIndex
CREATE INDEX "Extintor_shipId_idx" ON "Extintor"("shipId");

-- CreateIndex
CREATE INDEX "Extintor_estado_idx" ON "Extintor"("estado");

-- CreateIndex
CREATE INDEX "Extintor_dataProxRecarga_idx" ON "Extintor"("dataProxRecarga");

-- CreateIndex
CREATE INDEX "FatoImersaoComponentHistory_fatoImersaoId_idx" ON "FatoImersaoComponentHistory"("fatoImersaoId");

-- CreateIndex
CREATE INDEX "FatoImersaoComponentHistory_fieldName_idx" ON "FatoImersaoComponentHistory"("fieldName");

-- CreateIndex
CREATE INDEX "FatoImersaoComponentHistory_createdAt_idx" ON "FatoImersaoComponentHistory"("createdAt");

-- CreateIndex
CREATE INDEX "VerificacaoFatoImersao_fatoImersaoId_idx" ON "VerificacaoFatoImersao"("fatoImersaoId");

-- CreateIndex
CREATE INDEX "VerificacaoFatoImersao_dataVerificacao_idx" ON "VerificacaoFatoImersao"("dataVerificacao");

-- CreateIndex
CREATE INDEX "VerificacaoFatoImersao_resultadoGeral_idx" ON "VerificacaoFatoImersao"("resultadoGeral");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoFatoImersao_fatoImersaoId_key" ON "CertificadoFatoImersao"("fatoImersaoId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoFatoImersao_numeroCertificado_key" ON "CertificadoFatoImersao"("numeroCertificado");

-- CreateIndex
CREATE INDEX "CertificadoFatoImersao_fatoImersaoId_idx" ON "CertificadoFatoImersao"("fatoImersaoId");

-- CreateIndex
CREATE INDEX "CertificadoFatoImersao_dataCertificado_idx" ON "CertificadoFatoImersao"("dataCertificado");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_numeroCliente_key" ON "Cliente"("numeroCliente");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_nif_key" ON "Cliente"("nif");

-- CreateIndex
CREATE INDEX "Cliente_serviceStationId_idx" ON "Cliente"("serviceStationId");

-- CreateIndex
CREATE INDEX "Cliente_ilha_idx" ON "Cliente"("ilha");

-- CreateIndex
CREATE INDEX "Cliente_nome_idx" ON "Cliente"("nome");

-- CreateIndex
CREATE INDEX "Cliente_nif_idx" ON "Cliente"("nif");

-- CreateIndex
CREATE INDEX "Cliente_codigoPostal_idx" ON "Cliente"("codigoPostal");

-- CreateIndex
CREATE INDEX "ContactoInterno_categoria_idx" ON "ContactoInterno"("categoria");

-- CreateIndex
CREATE INDEX "ContactoInterno_empresa_idx" ON "ContactoInterno"("empresa");

-- CreateIndex
CREATE INDEX "ContactoInterno_localizacao_idx" ON "ContactoInterno"("localizacao");

-- CreateIndex
CREATE INDEX "ContactoInterno_nome_idx" ON "ContactoInterno"("nome");

-- CreateIndex
CREATE INDEX "ContactoInterno_ativo_idx" ON "ContactoInterno"("ativo");

-- CreateIndex
CREATE INDEX "ContactoInterno_fonte_idx" ON "ContactoInterno"("fonte");

-- CreateIndex
CREATE INDEX "ContactoInterno_tecnicoId_idx" ON "ContactoInterno"("tecnicoId");

-- CreateIndex
CREATE INDEX "ContactoInterno_serviceStationId_idx" ON "ContactoInterno"("serviceStationId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceStation_codigo_key" ON "ServiceStation"("codigo");

-- CreateIndex
CREATE INDEX "ServiceStation_ativo_idx" ON "ServiceStation"("ativo");

-- CreateIndex
CREATE INDEX "ServiceStation_territorioTipo_idx" ON "ServiceStation"("territorioTipo");

-- CreateIndex
CREATE INDEX "ServiceStation_regiaoOperacional_idx" ON "ServiceStation"("regiaoOperacional");

-- CreateIndex
CREATE INDEX "ServiceStation_nome_idx" ON "ServiceStation"("nome");

-- CreateIndex
CREATE INDEX "Navio_serviceStationId_idx" ON "Navio"("serviceStationId");

-- CreateIndex
CREATE INDEX "Navio_clienteId_idx" ON "Navio"("clienteId");

-- CreateIndex
CREATE INDEX "Navio_ilha_idx" ON "Navio"("ilha");

-- CreateIndex
CREATE INDEX "Navio_territorioGrupo_idx" ON "Navio"("territorioGrupo");

-- CreateIndex
CREATE INDEX "Navio_tipoPesca_idx" ON "Navio"("tipoPesca");

-- CreateIndex
CREATE INDEX "Navio_matricula_idx" ON "Navio"("matricula");

-- CreateIndex
CREATE INDEX "Navio_portoRegisto_idx" ON "Navio"("portoRegisto");

-- CreateIndex
CREATE INDEX "Navio_mmsi_idx" ON "Navio"("mmsi");

-- CreateIndex
CREATE INDEX "Navio_imo_idx" ON "Navio"("imo");

-- CreateIndex
CREATE INDEX "Navio_lat_idx" ON "Navio"("lat");

-- CreateIndex
CREATE INDEX "Navio_lng_idx" ON "Navio"("lng");

-- CreateIndex
CREATE INDEX "Agenda_serviceStationId_idx" ON "Agenda"("serviceStationId");

-- CreateIndex
CREATE INDEX "AgendaEvento_raftSerial_idx" ON "AgendaEvento"("raftSerial");

-- CreateIndex
CREATE INDEX "AgendaEvento_date_idx" ON "AgendaEvento"("date");

-- CreateIndex
CREATE INDEX "AgendaEvento_serviceStationId_idx" ON "AgendaEvento"("serviceStationId");

-- CreateIndex
CREATE INDEX "AgendaEvento_status_idx" ON "AgendaEvento"("status");

-- CreateIndex
CREATE INDEX "AgendaEvento_responsavel_date_idx" ON "AgendaEvento"("responsavel", "date");

-- CreateIndex
CREATE INDEX "AgendaEvento_serviceStationId_date_idx" ON "AgendaEvento"("serviceStationId", "date");

-- CreateIndex
CREATE INDEX "PedidoAssistencia_jangadaSerial_idx" ON "PedidoAssistencia"("jangadaSerial");

-- CreateIndex
CREATE INDEX "PedidoAssistencia_estado_idx" ON "PedidoAssistencia"("estado");

-- CreateIndex
CREATE INDEX "PedidoAssistencia_serviceStationId_idx" ON "PedidoAssistencia"("serviceStationId");

-- CreateIndex
CREATE INDEX "CatalogMarcaModelo_tipo_marca_idx" ON "CatalogMarcaModelo"("tipo", "marca");

-- CreateIndex
CREATE INDEX "CatalogMarcaModelo_tipo_modelo_idx" ON "CatalogMarcaModelo"("tipo", "modelo");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogMarcaModelo_tipo_marcaKey_modeloKey_key" ON "CatalogMarcaModelo"("tipo", "marcaKey", "modeloKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Jangada_serial_key" ON "Jangada"("serial");

-- CreateIndex
CREATE INDEX "Jangada_serviceStationId_idx" ON "Jangada"("serviceStationId");

-- CreateIndex
CREATE INDEX "Jangada_certificadoAtivoId_idx" ON "Jangada"("certificadoAtivoId");

-- CreateIndex
CREATE INDEX "Jangada_shipId_idx" ON "Jangada"("shipId");

-- CreateIndex
CREATE INDEX "Jangada_brand_idx" ON "Jangada"("brand");

-- CreateIndex
CREATE INDEX "Jangada_model_idx" ON "Jangada"("model");

-- CreateIndex
CREATE INDEX "Jangada_owner_idx" ON "Jangada"("owner");

-- CreateIndex
CREATE INDEX "Jangada_packType_idx" ON "Jangada"("packType");

-- CreateIndex
CREATE INDEX "Jangada_dataProxInspecao_idx" ON "Jangada"("dataProxInspecao");

-- CreateIndex
CREATE INDEX "Jangada_serviceStationId_dataProxInspecao_idx" ON "Jangada"("serviceStationId", "dataProxInspecao");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoExtraido_fileName_key" ON "CertificadoExtraido"("fileName");

-- CreateIndex
CREATE INDEX "CertificadoExtraido_raftSerial_idx" ON "CertificadoExtraido"("raftSerial");

-- CreateIndex
CREATE INDEX "CertificadoExtraido_shipName_idx" ON "CertificadoExtraido"("shipName");

-- CreateIndex
CREATE INDEX "CertificadoExtraido_dataInspecao_idx" ON "CertificadoExtraido"("dataInspecao");

-- CreateIndex
CREATE INDEX "CertificadoExtraido_isMaisRecente_idx" ON "CertificadoExtraido"("isMaisRecente");

-- CreateIndex
CREATE INDEX "CertificadoValidade_certificadoId_idx" ON "CertificadoValidade"("certificadoId");

-- CreateIndex
CREATE INDEX "CertificadoValidade_item_idx" ON "CertificadoValidade"("item");

-- CreateIndex
CREATE INDEX "CertificadoValidade_validade_idx" ON "CertificadoValidade"("validade");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoValidade_certificadoId_item_validade_rowNumber_key" ON "CertificadoValidade"("certificadoId", "item", "validade", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_codigoBarras_key" ON "Stock"("codigoBarras");

-- CreateIndex
CREATE INDEX "Stock_categoria_idx" ON "Stock"("categoria");

-- CreateIndex
CREATE INDEX "Stock_associavelJangada_idx" ON "Stock"("associavelJangada");

-- CreateIndex
CREATE INDEX "Stock_aplicavelMarcaJangada_idx" ON "Stock"("aplicavelMarcaJangada");

-- CreateIndex
CREATE INDEX "Stock_aplicavelModeloJangada_idx" ON "Stock"("aplicavelModeloJangada");

-- CreateIndex
CREATE INDEX "Stock_estadoCargaCilindro_idx" ON "Stock"("estadoCargaCilindro");

-- CreateIndex
CREATE INDEX "Stock_serviceStationId_idx" ON "Stock"("serviceStationId");

-- CreateIndex
CREATE INDEX "Stock_estadoArtigo_idx" ON "Stock"("estadoArtigo");

-- CreateIndex
CREATE INDEX "Stock_validade_idx" ON "Stock"("validade");

-- CreateIndex
CREATE INDEX "Stock_quantidade_idx" ON "Stock"("quantidade");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_referencia_serviceStationId_key" ON "Stock"("referencia", "serviceStationId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomPackType_name_key" ON "CustomPackType"("name");

-- CreateIndex
CREATE INDEX "CustomPackType_isActive_idx" ON "CustomPackType"("isActive");

-- CreateIndex
CREATE INDEX "CustomPackType_name_idx" ON "CustomPackType"("name");

-- CreateIndex
CREATE INDEX "CustomPackTypeItem_customPackTypeId_idx" ON "CustomPackTypeItem"("customPackTypeId");

-- CreateIndex
CREATE INDEX "CustomPackTypeItem_stockId_idx" ON "CustomPackTypeItem"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomPackTypeItem_customPackTypeId_stockReference_key" ON "CustomPackTypeItem"("customPackTypeId", "stockReference");

-- CreateIndex
CREATE INDEX "MovimentacaoStock_stockId_idx" ON "MovimentacaoStock"("stockId");

-- CreateIndex
CREATE INDEX "MovimentacaoStock_createdAt_idx" ON "MovimentacaoStock"("createdAt");

-- CreateIndex
CREATE INDEX "MovimentacaoStock_tipo_idx" ON "MovimentacaoStock"("tipo");

-- CreateIndex
CREATE INDEX "MovimentacaoStock_tipo_createdAt_idx" ON "MovimentacaoStock"("tipo", "createdAt");

-- CreateIndex
CREATE INDEX "MovimentacaoStock_ordemServicoId_idx" ON "MovimentacaoStock"("ordemServicoId");

-- CreateIndex
CREATE INDEX "MovimentacaoStock_inspecaoId_idx" ON "MovimentacaoStock"("inspecaoId");

-- CreateIndex
CREATE INDEX "MovimentacaoStock_pedidoReposicaoId_idx" ON "MovimentacaoStock"("pedidoReposicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoReposicao_numero_key" ON "PedidoReposicao"("numero");

-- CreateIndex
CREATE INDEX "PedidoReposicao_status_idx" ON "PedidoReposicao"("status");

-- CreateIndex
CREATE INDEX "PedidoReposicao_fornecedor_idx" ON "PedidoReposicao"("fornecedor");

-- CreateIndex
CREATE INDEX "PedidoReposicao_createdAt_idx" ON "PedidoReposicao"("createdAt");

-- CreateIndex
CREATE INDEX "PedidoReposicao_serviceStationId_idx" ON "PedidoReposicao"("serviceStationId");

-- CreateIndex
CREATE INDEX "PedidoReposicaoLinha_pedidoId_idx" ON "PedidoReposicaoLinha"("pedidoId");

-- CreateIndex
CREATE INDEX "PedidoReposicaoLinha_stockId_idx" ON "PedidoReposicaoLinha"("stockId");

-- CreateIndex
CREATE INDEX "PedidoReposicaoLinha_status_idx" ON "PedidoReposicaoLinha"("status");

-- CreateIndex
CREATE INDEX "PedidoReposicaoLinha_referencia_idx" ON "PedidoReposicaoLinha"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "Inspecao_certificadoNumero_key" ON "Inspecao"("certificadoNumero");

-- CreateIndex
CREATE INDEX "Inspecao_numeroObra_idx" ON "Inspecao"("numeroObra");

-- CreateIndex
CREATE INDEX "Inspecao_navioNome_idx" ON "Inspecao"("navioNome");

-- CreateIndex
CREATE INDEX "Inspecao_navioId_idx" ON "Inspecao"("navioId");

-- CreateIndex
CREATE INDEX "Inspecao_jangadaId_idx" ON "Inspecao"("jangadaId");

-- CreateIndex
CREATE INDEX "Inspecao_jangadaSerial_idx" ON "Inspecao"("jangadaSerial");

-- CreateIndex
CREATE INDEX "Inspecao_coleteId_idx" ON "Inspecao"("coleteId");

-- CreateIndex
CREATE INDEX "Inspecao_coleteSerial_idx" ON "Inspecao"("coleteSerial");

-- CreateIndex
CREATE INDEX "Inspecao_dataInspecao_idx" ON "Inspecao"("dataInspecao");

-- CreateIndex
CREATE INDEX "Inspecao_status_idx" ON "Inspecao"("status");

-- CreateIndex
CREATE INDEX "Inspecao_dataInspecao_status_idx" ON "Inspecao"("dataInspecao", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemServico_numeroOrdem_key" ON "OrdemServico"("numeroOrdem");

-- CreateIndex
CREATE INDEX "OrdemServico_serviceStationId_idx" ON "OrdemServico"("serviceStationId");

-- CreateIndex
CREATE INDEX "OrdemServico_jangadaId_idx" ON "OrdemServico"("jangadaId");

-- CreateIndex
CREATE INDEX "OrdemServico_shipId_idx" ON "OrdemServico"("shipId");

-- CreateIndex
CREATE INDEX "OrdemServico_clienteId_idx" ON "OrdemServico"("clienteId");

-- CreateIndex
CREATE INDEX "OrdemServico_tecnicoId_idx" ON "OrdemServico"("tecnicoId");

-- CreateIndex
CREATE INDEX "OrdemServico_inspecaoId_idx" ON "OrdemServico"("inspecaoId");

-- CreateIndex
CREATE INDEX "OrdemServico_pedidoAssistenciaId_idx" ON "OrdemServico"("pedidoAssistenciaId");

-- CreateIndex
CREATE INDEX "OrdemServico_status_idx" ON "OrdemServico"("status");

-- CreateIndex
CREATE INDEX "OrdemServico_tipo_idx" ON "OrdemServico"("tipo");

-- CreateIndex
CREATE INDEX "OrdemServico_prioridade_idx" ON "OrdemServico"("prioridade");

-- CreateIndex
CREATE INDEX "OrdemServico_dataAbertura_idx" ON "OrdemServico"("dataAbertura");

-- CreateIndex
CREATE INDEX "OrdemServico_dataPlaneadaInicio_idx" ON "OrdemServico"("dataPlaneadaInicio");

-- CreateIndex
CREATE INDEX "OrdemServico_dataPlaneadaFim_idx" ON "OrdemServico"("dataPlaneadaFim");

-- CreateIndex
CREATE INDEX "OrdemServico_dataPrevista_idx" ON "OrdemServico"("dataPrevista");

-- CreateIndex
CREATE INDEX "OrdemServico_serviceStationId_status_idx" ON "OrdemServico"("serviceStationId", "status");

-- CreateIndex
CREATE INDEX "OrdemServico_orcamentoStatus_idx" ON "OrdemServico"("orcamentoStatus");

-- CreateIndex
CREATE INDEX "OrdemServicoJangada_ordemServicoId_idx" ON "OrdemServicoJangada"("ordemServicoId");

-- CreateIndex
CREATE INDEX "OrdemServicoJangada_jangadaId_idx" ON "OrdemServicoJangada"("jangadaId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemServicoJangada_ordemServicoId_jangadaId_key" ON "OrdemServicoJangada"("ordemServicoId", "jangadaId");

-- CreateIndex
CREATE UNIQUE INDEX "Tecnico_email_key" ON "Tecnico"("email");

-- CreateIndex
CREATE INDEX "Tecnico_serviceStationId_idx" ON "Tecnico"("serviceStationId");

-- CreateIndex
CREATE INDEX "Tecnico_nome_idx" ON "Tecnico"("nome");

-- CreateIndex
CREATE INDEX "Tecnico_ativo_idx" ON "Tecnico"("ativo");

-- CreateIndex
CREATE INDEX "TecnicoAusencia_tecnicoKey_idx" ON "TecnicoAusencia"("tecnicoKey");

-- CreateIndex
CREATE INDEX "TecnicoAusencia_dataInicio_idx" ON "TecnicoAusencia"("dataInicio");

-- CreateIndex
CREATE INDEX "TecnicoAusencia_dataFim_idx" ON "TecnicoAusencia"("dataFim");

-- CreateIndex
CREATE INDEX "TecnicoAusencia_tecnicoId_idx" ON "TecnicoAusencia"("tecnicoId");

-- CreateIndex
CREATE INDEX "OrdemServicoChecklistItem_ordemServicoId_idx" ON "OrdemServicoChecklistItem"("ordemServicoId");

-- CreateIndex
CREATE INDEX "OrdemServicoChecklistItem_phase_idx" ON "OrdemServicoChecklistItem"("phase");

-- CreateIndex
CREATE INDEX "OrdemServicoChecklistItem_category_idx" ON "OrdemServicoChecklistItem"("category");

-- CreateIndex
CREATE INDEX "OrdemServicoChecklistItem_updatedById_idx" ON "OrdemServicoChecklistItem"("updatedById");

-- CreateIndex
CREATE INDEX "OrdemServicoTempo_ordemServicoId_idx" ON "OrdemServicoTempo"("ordemServicoId");

-- CreateIndex
CREATE INDEX "OrdemServicoTempo_tecnicoId_idx" ON "OrdemServicoTempo"("tecnicoId");

-- CreateIndex
CREATE INDEX "OrdemServicoTempo_startedAt_idx" ON "OrdemServicoTempo"("startedAt");

-- CreateIndex
CREATE INDEX "OrdemServicoLog_ordemServicoId_idx" ON "OrdemServicoLog"("ordemServicoId");

-- CreateIndex
CREATE INDEX "OrdemServicoLog_at_idx" ON "OrdemServicoLog"("at");

-- CreateIndex
CREATE INDEX "OrdemServicoLog_type_idx" ON "OrdemServicoLog"("type");

-- CreateIndex
CREATE INDEX "OrdemServicoLog_tecnicoId_idx" ON "OrdemServicoLog"("tecnicoId");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_numeroFatura_key" ON "Fatura"("numeroFatura");

-- CreateIndex
CREATE INDEX "Fatura_clienteId_idx" ON "Fatura"("clienteId");

-- CreateIndex
CREATE INDEX "Fatura_dataEmissao_idx" ON "Fatura"("dataEmissao");

-- CreateIndex
CREATE INDEX "Fatura_pagamentoStatus_idx" ON "Fatura"("pagamentoStatus");

-- CreateIndex
CREATE INDEX "Fatura_cancelada_idx" ON "Fatura"("cancelada");

-- CreateIndex
CREATE UNIQUE INDEX "FaturaOrdemServico_ordemServicoId_key" ON "FaturaOrdemServico"("ordemServicoId");

-- CreateIndex
CREATE INDEX "FaturaOrdemServico_faturaId_idx" ON "FaturaOrdemServico"("faturaId");

-- CreateIndex
CREATE UNIQUE INDEX "FaturaOrdemServico_faturaId_ordemServicoId_key" ON "FaturaOrdemServico"("faturaId", "ordemServicoId");

-- CreateIndex
CREATE UNIQUE INDEX "NotaCredito_numeroNotaCredito_key" ON "NotaCredito"("numeroNotaCredito");

-- CreateIndex
CREATE UNIQUE INDEX "NotaCredito_faturaId_key" ON "NotaCredito"("faturaId");

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_numeroRecibo_key" ON "Recibo"("numeroRecibo");

-- CreateIndex
CREATE INDEX "Recibo_faturaId_idx" ON "Recibo"("faturaId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipamento_serial_key" ON "Equipamento"("serial");

-- CreateIndex
CREATE INDEX "Equipamento_nome_idx" ON "Equipamento"("nome");

-- CreateIndex
CREATE INDEX "Equipamento_estado_idx" ON "Equipamento"("estado");

-- CreateIndex
CREATE INDEX "ServiceStationQueue_serviceStationId_idx" ON "ServiceStationQueue"("serviceStationId");

-- CreateIndex
CREATE INDEX "ServiceStationQueue_jangadaId_idx" ON "ServiceStationQueue"("jangadaId");

-- CreateIndex
CREATE INDEX "ServiceStationQueue_ordemServicoId_idx" ON "ServiceStationQueue"("ordemServicoId");

-- CreateIndex
CREATE INDEX "ServiceStationQueue_status_idx" ON "ServiceStationQueue"("status");

-- CreateIndex
CREATE INDEX "ServiceStationQueue_serviceStationId_status_idx" ON "ServiceStationQueue"("serviceStationId", "status");

-- CreateIndex
CREATE INDEX "Auditoria_tabela_idx" ON "Auditoria"("tabela");

-- CreateIndex
CREATE INDEX "Auditoria_tipoOperacao_idx" ON "Auditoria"("tipoOperacao");

-- CreateIndex
CREATE INDEX "Auditoria_createdAt_idx" ON "Auditoria"("createdAt");

-- CreateIndex
CREATE INDEX "Auditoria_usuario_idx" ON "Auditoria"("usuario");

-- CreateIndex
CREATE INDEX "CertificacaoFabricanteTecnico_tecnicoId_idx" ON "CertificacaoFabricanteTecnico"("tecnicoId");

-- CreateIndex
CREATE INDEX "CertificacaoFabricanteTecnico_fabricante_idx" ON "CertificacaoFabricanteTecnico"("fabricante");

-- CreateIndex
CREATE UNIQUE INDEX "CalibracaoEquipamento_referencia_key" ON "CalibracaoEquipamento"("referencia");

-- CreateIndex
CREATE INDEX "CalibracaoEquipamento_referencia_idx" ON "CalibracaoEquipamento"("referencia");

-- CreateIndex
CREATE INDEX "CalibracaoEquipamento_serviceStationId_idx" ON "CalibracaoEquipamento"("serviceStationId");

-- CreateIndex
CREATE INDEX "CalibracaoHistorico_calibracaoId_idx" ON "CalibracaoHistorico"("calibracaoId");

-- CreateIndex
CREATE INDEX "CalibracaoHistorico_referencia_idx" ON "CalibracaoHistorico"("referencia");

-- CreateIndex
CREATE INDEX "CalibracaoHistorico_serviceStationId_idx" ON "CalibracaoHistorico"("serviceStationId");

-- CreateIndex
CREATE INDEX "CalibracaoHistorico_dataCalibracao_idx" ON "CalibracaoHistorico"("dataCalibracao");

-- CreateIndex
CREATE INDEX "MovimentoEquipamento_equipamentoId_idx" ON "MovimentoEquipamento"("equipamentoId");

-- CreateIndex
CREATE INDEX "MovimentoEquipamento_data_idx" ON "MovimentoEquipamento"("data");

-- CreateIndex
CREATE INDEX "MovimentoEquipamento_tipoEquipamento_equipamentoId_idx" ON "MovimentoEquipamento"("tipoEquipamento", "equipamentoId");

-- CreateIndex
CREATE INDEX "Custo_tipo_idx" ON "Custo"("tipo");

-- CreateIndex
CREATE INDEX "Custo_data_idx" ON "Custo"("data");

-- CreateIndex
CREATE INDEX "Custo_serviceStationId_idx" ON "Custo"("serviceStationId");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_codigo_key" ON "Fornecedor"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemCompra_numero_key" ON "OrdemCompra"("numero");

-- CreateIndex
CREATE INDEX "OrdemCompra_fornecedorId_idx" ON "OrdemCompra"("fornecedorId");

-- CreateIndex
CREATE INDEX "OrdemCompra_status_idx" ON "OrdemCompra"("status");

-- CreateIndex
CREATE INDEX "OrdemCompraLinha_ordemCompraId_idx" ON "OrdemCompraLinha"("ordemCompraId");

-- CreateIndex
CREATE INDEX "OrdemCompraLinha_stockId_idx" ON "OrdemCompraLinha"("stockId");

-- CreateIndex
CREATE INDEX "Comunicacao_clienteId_idx" ON "Comunicacao"("clienteId");

-- CreateIndex
CREATE INDEX "Comunicacao_jangadaId_idx" ON "Comunicacao"("jangadaId");

-- CreateIndex
CREATE INDEX "Comunicacao_ordemServicoId_idx" ON "Comunicacao"("ordemServicoId");

-- CreateIndex
CREATE INDEX "Comunicacao_tipo_idx" ON "Comunicacao"("tipo");

-- CreateIndex
CREATE INDEX "Comunicacao_status_idx" ON "Comunicacao"("status");

-- CreateIndex
CREATE INDEX "Comunicacao_enviadoEm_idx" ON "Comunicacao"("enviadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "DeclaracaoIsencaoIva_numeroCompleto_key" ON "DeclaracaoIsencaoIva"("numeroCompleto");

-- CreateIndex
CREATE INDEX "DeclaracaoIsencaoIva_ano_idx" ON "DeclaracaoIsencaoIva"("ano");

-- CreateIndex
CREATE INDEX "DeclaracaoIsencaoIva_numeroSequencial_idx" ON "DeclaracaoIsencaoIva"("numeroSequencial");

-- CreateIndex
CREATE INDEX "ImportacaoIaExemplo_jangadaId_idx" ON "ImportacaoIaExemplo"("jangadaId");

-- CreateIndex
CREATE INDEX "ImportacaoIaExemplo_createdAt_idx" ON "ImportacaoIaExemplo"("createdAt");

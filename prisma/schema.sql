-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ServiceStationTerritoryType" AS ENUM ('AZORES', 'MAINLAND', 'MADEIRA');

-- CreateEnum
CREATE TYPE "MainlandRegion" AS ENUM ('NORTE', 'CENTRO', 'SUL', 'MADEIRA');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER', 'CLIENTE');

-- CreateEnum
CREATE TYPE "CatalogTipoEquipamento" AS ENUM ('COLETE', 'JANGADA', 'FATO_IMERSAO');

-- CreateTable
CREATE TABLE "ArtigoJangada" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "validade" TIMESTAMP(3),
    "referencia" TEXT,
    "codigoFabricante" TEXT,
    "jangadaId" INTEGER NOT NULL,
    "stockId" INTEGER,
    "inspecaoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtigoJangada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artigo" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "descricao" TEXT,
    "referencia" TEXT,
    "unit" TEXT DEFAULT 'un',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artigo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colete" (
    "id" SERIAL NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Colete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epirb" (
    "id" SERIAL NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Epirb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificacaoColete" (
    "id" SERIAL NOT NULL,
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
    "dataVerificacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectorNome" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificacaoColete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificadoColete" (
    "id" SERIAL NOT NULL,
    "coleteId" INTEGER NOT NULL,
    "numeroCertificado" TEXT NOT NULL,
    "dataCertificado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataValidade" TIMESTAMP(3),
    "resultado" TEXT NOT NULL DEFAULT 'Aprovado',
    "emitidoPor" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificadoColete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FatoImersao" (
    "id" SERIAL NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FatoImersao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FatoImersaoComponentHistory" (
    "id" SERIAL NOT NULL,
    "fatoImersaoId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedById" INTEGER,
    "changedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FatoImersaoComponentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificacaoFatoImersao" (
    "id" SERIAL NOT NULL,
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
    "dataVerificacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectorNome" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificacaoFatoImersao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificadoFatoImersao" (
    "id" SERIAL NOT NULL,
    "fatoImersaoId" INTEGER NOT NULL,
    "numeroCertificado" TEXT NOT NULL,
    "dataCertificado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataValidade" TIMESTAMP(3),
    "resultado" TEXT NOT NULL DEFAULT 'Aprovado',
    "emitidoPor" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificadoFatoImersao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
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
    "verificationCode" TEXT,
    "verificationCodeExpires" TIMESTAMP(3),

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactoInterno" (
    "id" SERIAL NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactoInterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceStation" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "empresa" TEXT,
    "localizacao" TEXT,
    "territorioTipo" "ServiceStationTerritoryType" NOT NULL DEFAULT 'MAINLAND',
    "regiaoOperacional" "MainlandRegion",
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Navio" (
    "id" SERIAL NOT NULL,
    "serviceStationId" INTEGER,
    "nome" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "ilha" TEXT NOT NULL,
    "tipoPesca" TEXT NOT NULL,
    "tipoNavio" TEXT,
    "comprimentoMetros" DOUBLE PRECISION,
    "zonaNavegacao" TEXT,
    "proprietario" TEXT,
    "bandeira" TEXT,
    "mmsi" TEXT,
    "imo" TEXT,
    "callSignal" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "hruReferencia" TEXT,
    "hruValidade" TEXT,
    "pirotecnicosBordoJson" TEXT,
    "radarReflector" TEXT,
    "radarReflectorValidade" TEXT,
    "portoRegisto" TEXT,
    "territorioGrupo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "clienteId" INTEGER,

    CONSTRAINT "Navio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agenda" (
    "id" SERIAL NOT NULL,
    "serviceStationId" INTEGER,
    "nome" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "embarcacoesDePesca" TEXT NOT NULL,
    "tipoPesca" TEXT NOT NULL,
    "lotacao" INTEGER NOT NULL,
    "bandeira" TEXT NOT NULL,
    "clienteId" INTEGER,

    CONSTRAINT "Agenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaEvento" (
    "id" SERIAL NOT NULL,
    "serviceStationId" INTEGER,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "raftSerial" TEXT NOT NULL,
    "responsavel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "type" TEXT NOT NULL DEFAULT 'Inspeção',
    "inspectionType" TEXT NOT NULL DEFAULT 'outro',
    "durationMinutes" INTEGER NOT NULL DEFAULT 210,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 15,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogMarcaModelo" (
    "id" SERIAL NOT NULL,
    "tipo" "CatalogTipoEquipamento" NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "marcaKey" TEXT NOT NULL,
    "modeloKey" TEXT NOT NULL,
    "origem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogMarcaModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "permissionsOverrideJson" TEXT,
    "googleId" TEXT,
    "image" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clienteId" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" INTEGER NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jangada" (
    "id" SERIAL NOT NULL,
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
    "capacity" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "shipId" INTEGER,
    "shipNameManual" TEXT,
    "dataInspecao" TEXT,
    "dataProxInspecao" TEXT,
    "ultimoCertificadoNumero" TEXT,
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
    "valvulasAlivio" TEXT,
    "valvulasAtestar" TEXT,
    "hruReferencia" TEXT,
    "hruDataInstalacao" TEXT,
    "hruValidade" TEXT,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "certificadoAtivoId" INTEGER,
    "signatureBase64" TEXT,

    CONSTRAINT "Jangada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificadoExtraido" (
    "id" SERIAL NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificadoExtraido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificadoValidade" (
    "id" SERIAL NOT NULL,
    "certificadoId" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "validade" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificadoValidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" SERIAL NOT NULL,
    "referencia" TEXT NOT NULL,
    "serviceStationId" INTEGER,
    "descricao" TEXT NOT NULL,
    "estadoArtigo" TEXT NOT NULL DEFAULT 'ATIVO',
    "referenciaSubstituta" TEXT,
    "categoria" TEXT,
    "associavelJangada" BOOLEAN NOT NULL DEFAULT false,
    "aplicavelMarcaJangada" TEXT,
    "aplicavelModeloJangada" TEXT,
    "precoCompra" DOUBLE PRECISION,
    "codigoFabricante" TEXT,
    "inventario" TEXT,
    "lote" TEXT,
    "validade" TEXT,
    "testeHidraulico" TEXT,
    "estadoCargaCilindro" TEXT,
    "precoVenda" DOUBLE PRECISION NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "quantidadeMinima" INTEGER,
    "foto" TEXT,
    "localizacao" TEXT,
    "observacoes" TEXT,
    "codigoBarras" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPackType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomPackType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPackTypeItem" (
    "id" SERIAL NOT NULL,
    "customPackTypeId" INTEGER NOT NULL,
    "stockId" INTEGER,
    "stockReference" TEXT NOT NULL,
    "stockDescription" TEXT NOT NULL,
    "stockCategory" TEXT,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomPackTypeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentacaoStock" (
    "id" SERIAL NOT NULL,
    "stockId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "quantidadeAntes" INTEGER NOT NULL,
    "quantidadeDepois" INTEGER NOT NULL,
    "motivo" TEXT,
    "usuario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentacaoStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspecao" (
    "id" SERIAL NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
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

    CONSTRAINT "Inspecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemServico" (
    "id" SERIAL NOT NULL,
    "numeroOrdem" TEXT NOT NULL,
    "serviceStationId" INTEGER,
    "jangadaId" INTEGER NOT NULL,
    "shipId" INTEGER,
    "clienteId" INTEGER,
    "tecnicoId" INTEGER,
    "inspecaoId" INTEGER,
    "tipo" TEXT NOT NULL DEFAULT 'inspecao',
    "prioridade" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "descricao" TEXT,
    "tecnicoResponsavel" TEXT,
    "slaHoras" INTEGER,
    "dataPlaneadaInicio" TIMESTAMP(3),
    "dataPlaneadaFim" TIMESTAMP(3),
    "dataAbertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataPrevista" TIMESTAMP(3),
    "dataInicio" TIMESTAMP(3),
    "dataConclusao" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 210,
    "orcamentoStatus" TEXT NOT NULL DEFAULT 'Rascunho',
    "isPesca" BOOLEAN NOT NULL DEFAULT false,
    "isIsentoIva" BOOLEAN NOT NULL DEFAULT false,
    "codigoIsencaoIva" TEXT,
    "valorPecas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorMaoObra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadados" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdemServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemServicoJangada" (
    "id" SERIAL NOT NULL,
    "ordemServicoId" INTEGER NOT NULL,
    "jangadaId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdemServicoJangada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tecnico" (
    "id" SERIAL NOT NULL,
    "serviceStationId" INTEGER,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TecnicoAusencia" (
    "id" SERIAL NOT NULL,
    "tecnicoKey" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tecnicoId" INTEGER,

    CONSTRAINT "TecnicoAusencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemServicoChecklistItem" (
    "id" SERIAL NOT NULL,
    "ordemServicoId" INTEGER NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'pre',
    "category" TEXT,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "barcode" TEXT,
    "scannedAt" TIMESTAMP(3),
    "photoUrl" TEXT,
    "notes" TEXT,
    "isDefect" BOOLEAN NOT NULL DEFAULT false,
    "originalDiagramRef" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdemServicoChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemServicoTempo" (
    "id" SERIAL NOT NULL,
    "ordemServicoId" INTEGER NOT NULL,
    "tecnicoId" INTEGER,
    "tecnico" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdemServicoTempo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemServicoLog" (
    "id" SERIAL NOT NULL,
    "ordemServicoId" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL DEFAULT 'EVENT',
    "message" TEXT NOT NULL,
    "user" TEXT,
    "tecnicoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdemServicoLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fatura" (
    "id" SERIAL NOT NULL,
    "numeroFatura" TEXT NOT NULL,
    "clienteId" INTEGER,
    "shipId" INTEGER,
    "valorSubtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorIva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isIsentoIva" BOOLEAN NOT NULL DEFAULT false,
    "codigoIsencaoIva" TEXT,
    "pagamentoStatus" TEXT NOT NULL DEFAULT 'Pendente',
    "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidaPor" TEXT,
    "metadados" TEXT,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "dataCancelamento" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaturaOrdemServico" (
    "id" SERIAL NOT NULL,
    "faturaId" INTEGER NOT NULL,
    "ordemServicoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaturaOrdemServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaCredito" (
    "id" SERIAL NOT NULL,
    "numeroNotaCredito" TEXT NOT NULL,
    "faturaId" INTEGER NOT NULL,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidaPor" TEXT,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recibo" (
    "id" SERIAL NOT NULL,
    "numeroRecibo" TEXT NOT NULL,
    "faturaId" INTEGER NOT NULL,
    "valorPago" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pagamentoStatus" TEXT NOT NULL DEFAULT 'Pago',
    "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidaPor" TEXT,
    "metadados" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recibo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipamento" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "serial" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Ativo',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceStationQueue" (
    "id" SERIAL NOT NULL,
    "serviceStationId" INTEGER,
    "jangadaId" INTEGER NOT NULL,
    "ordemServicoId" INTEGER,
    "dataChegada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataPrevistaEntrega" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Aguardando',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceStationQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" SERIAL NOT NULL,
    "tabela" TEXT NOT NULL,
    "tipoOperacao" TEXT NOT NULL,
    "idRegisto" INTEGER NOT NULL,
    "descricao" TEXT,
    "usuario" TEXT,
    "dadosAntes" TEXT,
    "dadosDepois" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificacaoFabricanteTecnico" (
    "id" SERIAL NOT NULL,
    "tecnicoId" INTEGER NOT NULL,
    "fabricante" TEXT NOT NULL,
    "numeroCertificado" TEXT,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataValidade" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificacaoFabricanteTecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibracaoEquipamento" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataCalibracao" TIMESTAMP(3) NOT NULL,
    "dataProxCalibracao" TIMESTAMP(3) NOT NULL,
    "certificadoNum" TEXT,
    "certificadoUrl" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalibracaoEquipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoEquipamento" (
    "id" SERIAL NOT NULL,
    "tipoEquipamento" TEXT NOT NULL,
    "equipamentoId" INTEGER NOT NULL,
    "serial" TEXT NOT NULL,
    "origemShipId" INTEGER,
    "origemShipNome" TEXT,
    "destinoShipId" INTEGER,
    "destinoShipNome" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT,

    CONSTRAINT "MovimentoEquipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recall" (
    "id" SERIAL NOT NULL,
    "fabricante" TEXT NOT NULL,
    "modeloPattern" TEXT,
    "serialPattern" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "acaoRequerida" TEXT NOT NULL,
    "gravidade" TEXT NOT NULL,
    "dataPublicacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Recall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Custo" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "data" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "serviceStationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Custo_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "Colete_serial_key" ON "Colete"("serial");

-- CreateIndex
CREATE INDEX "Colete_shipId_idx" ON "Colete"("shipId");

-- CreateIndex
CREATE INDEX "Colete_estado_idx" ON "Colete"("estado");

-- CreateIndex
CREATE INDEX "Colete_dataProxInspecao_idx" ON "Colete"("dataProxInspecao");

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
CREATE INDEX "VerificacaoColete_coleteId_idx" ON "VerificacaoColete"("coleteId");

-- CreateIndex
CREATE INDEX "VerificacaoColete_dataVerificacao_idx" ON "VerificacaoColete"("dataVerificacao");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoColete_coleteId_key" ON "CertificadoColete"("coleteId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoColete_numeroCertificado_key" ON "CertificadoColete"("numeroCertificado");

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

-- AddForeignKey
ALTER TABLE "ArtigoJangada" ADD CONSTRAINT "ArtigoJangada_jangadaId_fkey" FOREIGN KEY ("jangadaId") REFERENCES "Jangada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtigoJangada" ADD CONSTRAINT "ArtigoJangada_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtigoJangada" ADD CONSTRAINT "ArtigoJangada_inspecaoId_fkey" FOREIGN KEY ("inspecaoId") REFERENCES "Inspecao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificacaoColete" ADD CONSTRAINT "VerificacaoColete_coleteId_fkey" FOREIGN KEY ("coleteId") REFERENCES "Colete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificadoColete" ADD CONSTRAINT "CertificadoColete_coleteId_fkey" FOREIGN KEY ("coleteId") REFERENCES "Colete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificacaoFatoImersao" ADD CONSTRAINT "VerificacaoFatoImersao_fatoImersaoId_fkey" FOREIGN KEY ("fatoImersaoId") REFERENCES "FatoImersao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificadoFatoImersao" ADD CONSTRAINT "CertificadoFatoImersao_fatoImersaoId_fkey" FOREIGN KEY ("fatoImersaoId") REFERENCES "FatoImersao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Navio" ADD CONSTRAINT "Navio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Navio" ADD CONSTRAINT "Navio_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agenda" ADD CONSTRAINT "Agenda_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agenda" ADD CONSTRAINT "Agenda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaEvento" ADD CONSTRAINT "AgendaEvento_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jangada" ADD CONSTRAINT "Jangada_certificadoAtivoId_fkey" FOREIGN KEY ("certificadoAtivoId") REFERENCES "CertificadoExtraido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jangada" ADD CONSTRAINT "Jangada_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificadoExtraido" ADD CONSTRAINT "CertificadoExtraido_raftSerial_fkey" FOREIGN KEY ("raftSerial") REFERENCES "Jangada"("serial") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificadoValidade" ADD CONSTRAINT "CertificadoValidade_certificadoId_fkey" FOREIGN KEY ("certificadoId") REFERENCES "CertificadoExtraido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPackType" ADD CONSTRAINT "CustomPackType_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPackType" ADD CONSTRAINT "CustomPackType_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPackTypeItem" ADD CONSTRAINT "CustomPackTypeItem_customPackTypeId_fkey" FOREIGN KEY ("customPackTypeId") REFERENCES "CustomPackType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPackTypeItem" ADD CONSTRAINT "CustomPackTypeItem_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoStock" ADD CONSTRAINT "MovimentacaoStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_jangadaId_fkey" FOREIGN KEY ("jangadaId") REFERENCES "Jangada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_inspecaoId_fkey" FOREIGN KEY ("inspecaoId") REFERENCES "Inspecao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoJangada" ADD CONSTRAINT "OrdemServicoJangada_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoJangada" ADD CONSTRAINT "OrdemServicoJangada_jangadaId_fkey" FOREIGN KEY ("jangadaId") REFERENCES "Jangada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tecnico" ADD CONSTRAINT "Tecnico_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TecnicoAusencia" ADD CONSTRAINT "TecnicoAusencia_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoChecklistItem" ADD CONSTRAINT "OrdemServicoChecklistItem_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoChecklistItem" ADD CONSTRAINT "OrdemServicoChecklistItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Tecnico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoTempo" ADD CONSTRAINT "OrdemServicoTempo_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoTempo" ADD CONSTRAINT "OrdemServicoTempo_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoLog" ADD CONSTRAINT "OrdemServicoLog_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoLog" ADD CONSTRAINT "OrdemServicoLog_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaturaOrdemServico" ADD CONSTRAINT "FaturaOrdemServico_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaturaOrdemServico" ADD CONSTRAINT "FaturaOrdemServico_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStationQueue" ADD CONSTRAINT "ServiceStationQueue_jangadaId_fkey" FOREIGN KEY ("jangadaId") REFERENCES "Jangada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStationQueue" ADD CONSTRAINT "ServiceStationQueue_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStationQueue" ADD CONSTRAINT "ServiceStationQueue_serviceStationId_fkey" FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificacaoFabricanteTecnico" ADD CONSTRAINT "CertificacaoFabricanteTecnico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE CASCADE ON UPDATE CASCADE;


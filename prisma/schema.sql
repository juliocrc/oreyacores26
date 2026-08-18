-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "ServiceStationTerritoryType" AS ENUM ('AZORES', 'MAINLAND', 'MADEIRA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "MainlandRegion" AS ENUM ('NORTE', 'CENTRO', 'SUL', 'MADEIRA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER', 'CLIENTE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CatalogTipoEquipamento" AS ENUM ('COLETE', 'JANGADA', 'FATO_IMERSAO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ArtigoJangada" (
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
CREATE TABLE IF NOT EXISTS "Artigo" (
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
CREATE TABLE IF NOT EXISTS "Colete" (
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
CREATE TABLE IF NOT EXISTS "Epirb" (
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
CREATE TABLE IF NOT EXISTS "VerificacaoColete" (
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
CREATE TABLE IF NOT EXISTS "CertificadoColete" (
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
CREATE TABLE IF NOT EXISTS "FatoImersao" (
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
CREATE TABLE IF NOT EXISTS "FatoImersaoComponentHistory" (
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
CREATE TABLE IF NOT EXISTS "VerificacaoFatoImersao" (
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
CREATE TABLE IF NOT EXISTS "CertificadoFatoImersao" (
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
CREATE TABLE IF NOT EXISTS "Cliente" (
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
CREATE TABLE IF NOT EXISTS "ContactoInterno" (
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
CREATE TABLE IF NOT EXISTS "ServiceStation" (
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
CREATE TABLE IF NOT EXISTS "Navio" (
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
CREATE TABLE IF NOT EXISTS "Agenda" (
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
CREATE TABLE IF NOT EXISTS "AgendaEvento" (
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
CREATE TABLE IF NOT EXISTS "CatalogMarcaModelo" (
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
CREATE TABLE IF NOT EXISTS "User" (
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
CREATE TABLE IF NOT EXISTS "Post" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" INTEGER NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Jangada" (
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
CREATE TABLE IF NOT EXISTS "CertificadoExtraido" (
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
CREATE TABLE IF NOT EXISTS "CertificadoValidade" (
    "id" SERIAL NOT NULL,
    "certificadoId" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "validade" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificadoValidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Stock" (
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
CREATE TABLE IF NOT EXISTS "CustomPackType" (
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
CREATE TABLE IF NOT EXISTS "CustomPackTypeItem" (
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
CREATE TABLE IF NOT EXISTS "MovimentacaoStock" (
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
CREATE TABLE IF NOT EXISTS "Inspecao" (
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
CREATE TABLE IF NOT EXISTS "OrdemServico" (
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
CREATE TABLE IF NOT EXISTS "OrdemServicoJangada" (
    "id" SERIAL NOT NULL,
    "ordemServicoId" INTEGER NOT NULL,
    "jangadaId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdemServicoJangada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Tecnico" (
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
CREATE TABLE IF NOT EXISTS "TecnicoAusencia" (
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
CREATE TABLE IF NOT EXISTS "OrdemServicoChecklistItem" (
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
CREATE TABLE IF NOT EXISTS "OrdemServicoTempo" (
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
CREATE TABLE IF NOT EXISTS "OrdemServicoLog" (
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
CREATE TABLE IF NOT EXISTS "Fatura" (
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
CREATE TABLE IF NOT EXISTS "FaturaOrdemServico" (
    "id" SERIAL NOT NULL,
    "faturaId" INTEGER NOT NULL,
    "ordemServicoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaturaOrdemServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NotaCredito" (
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
CREATE TABLE IF NOT EXISTS "Recibo" (
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
CREATE TABLE IF NOT EXISTS "Equipamento" (
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
CREATE TABLE IF NOT EXISTS "ServiceStationQueue" (
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
CREATE TABLE IF NOT EXISTS "Auditoria" (
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
CREATE TABLE IF NOT EXISTS "CertificacaoFabricanteTecnico" (
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
CREATE TABLE IF NOT EXISTS "CalibracaoEquipamento" (
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
CREATE TABLE IF NOT EXISTS "MovimentoEquipamento" (
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
CREATE TABLE IF NOT EXISTS "Recall" (
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
CREATE TABLE IF NOT EXISTS "Custo" (
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
CREATE INDEX IF NOT EXISTS "ArtigoJangada_stockId_idx" ON "ArtigoJangada"("stockId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ArtigoJangada_jangadaId_idx" ON "ArtigoJangada"("jangadaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Artigo_name_idx" ON "Artigo"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Artigo_referencia_idx" ON "Artigo"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Colete_serial_key" ON "Colete"("serial");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Colete_shipId_idx" ON "Colete"("shipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Colete_estado_idx" ON "Colete"("estado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Colete_dataProxInspecao_idx" ON "Colete"("dataProxInspecao");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Epirb_serial_key" ON "Epirb"("serial");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Epirb_shipId_idx" ON "Epirb"("shipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Epirb_estado_idx" ON "Epirb"("estado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Epirb_tipo_idx" ON "Epirb"("tipo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Epirb_dataProxInspecao_idx" ON "Epirb"("dataProxInspecao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificacaoColete_coleteId_idx" ON "VerificacaoColete"("coleteId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificacaoColete_dataVerificacao_idx" ON "VerificacaoColete"("dataVerificacao");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoColete_coleteId_key" ON "CertificadoColete"("coleteId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoColete_numeroCertificado_key" ON "CertificadoColete"("numeroCertificado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoColete_coleteId_idx" ON "CertificadoColete"("coleteId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoColete_dataCertificado_idx" ON "CertificadoColete"("dataCertificado");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FatoImersao_serial_key" ON "FatoImersao"("serial");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FatoImersao_shipId_idx" ON "FatoImersao"("shipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FatoImersao_estado_idx" ON "FatoImersao"("estado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FatoImersao_dataProxInspecao_idx" ON "FatoImersao"("dataProxInspecao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FatoImersaoComponentHistory_fatoImersaoId_idx" ON "FatoImersaoComponentHistory"("fatoImersaoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FatoImersaoComponentHistory_fieldName_idx" ON "FatoImersaoComponentHistory"("fieldName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FatoImersaoComponentHistory_createdAt_idx" ON "FatoImersaoComponentHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificacaoFatoImersao_fatoImersaoId_idx" ON "VerificacaoFatoImersao"("fatoImersaoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificacaoFatoImersao_dataVerificacao_idx" ON "VerificacaoFatoImersao"("dataVerificacao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificacaoFatoImersao_resultadoGeral_idx" ON "VerificacaoFatoImersao"("resultadoGeral");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoFatoImersao_fatoImersaoId_key" ON "CertificadoFatoImersao"("fatoImersaoId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoFatoImersao_numeroCertificado_key" ON "CertificadoFatoImersao"("numeroCertificado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoFatoImersao_fatoImersaoId_idx" ON "CertificadoFatoImersao"("fatoImersaoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoFatoImersao_dataCertificado_idx" ON "CertificadoFatoImersao"("dataCertificado");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Cliente_numeroCliente_key" ON "Cliente"("numeroCliente");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Cliente_nif_key" ON "Cliente"("nif");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Cliente_serviceStationId_idx" ON "Cliente"("serviceStationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Cliente_ilha_idx" ON "Cliente"("ilha");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Cliente_nome_idx" ON "Cliente"("nome");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Cliente_nif_idx" ON "Cliente"("nif");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Cliente_codigoPostal_idx" ON "Cliente"("codigoPostal");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContactoInterno_categoria_idx" ON "ContactoInterno"("categoria");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContactoInterno_empresa_idx" ON "ContactoInterno"("empresa");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContactoInterno_localizacao_idx" ON "ContactoInterno"("localizacao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContactoInterno_nome_idx" ON "ContactoInterno"("nome");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContactoInterno_ativo_idx" ON "ContactoInterno"("ativo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContactoInterno_fonte_idx" ON "ContactoInterno"("fonte");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceStation_codigo_key" ON "ServiceStation"("codigo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceStation_ativo_idx" ON "ServiceStation"("ativo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceStation_territorioTipo_idx" ON "ServiceStation"("territorioTipo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceStation_regiaoOperacional_idx" ON "ServiceStation"("regiaoOperacional");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceStation_nome_idx" ON "ServiceStation"("nome");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_serviceStationId_idx" ON "Navio"("serviceStationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_clienteId_idx" ON "Navio"("clienteId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_ilha_idx" ON "Navio"("ilha");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_territorioGrupo_idx" ON "Navio"("territorioGrupo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_tipoPesca_idx" ON "Navio"("tipoPesca");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_matricula_idx" ON "Navio"("matricula");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_portoRegisto_idx" ON "Navio"("portoRegisto");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_mmsi_idx" ON "Navio"("mmsi");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_imo_idx" ON "Navio"("imo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_lat_idx" ON "Navio"("lat");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Navio_lng_idx" ON "Navio"("lng");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Agenda_serviceStationId_idx" ON "Agenda"("serviceStationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgendaEvento_raftSerial_idx" ON "AgendaEvento"("raftSerial");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgendaEvento_date_idx" ON "AgendaEvento"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgendaEvento_serviceStationId_idx" ON "AgendaEvento"("serviceStationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgendaEvento_status_idx" ON "AgendaEvento"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgendaEvento_responsavel_date_idx" ON "AgendaEvento"("responsavel", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CatalogMarcaModelo_tipo_marca_idx" ON "CatalogMarcaModelo"("tipo", "marca");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CatalogMarcaModelo_tipo_modelo_idx" ON "CatalogMarcaModelo"("tipo", "modelo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CatalogMarcaModelo_tipo_marcaKey_modeloKey_key" ON "CatalogMarcaModelo"("tipo", "marcaKey", "modeloKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Jangada_serial_key" ON "Jangada"("serial");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Jangada_serviceStationId_idx" ON "Jangada"("serviceStationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Jangada_certificadoAtivoId_idx" ON "Jangada"("certificadoAtivoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Jangada_shipId_idx" ON "Jangada"("shipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Jangada_brand_idx" ON "Jangada"("brand");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Jangada_model_idx" ON "Jangada"("model");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Jangada_owner_idx" ON "Jangada"("owner");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Jangada_packType_idx" ON "Jangada"("packType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Jangada_dataProxInspecao_idx" ON "Jangada"("dataProxInspecao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Jangada_serviceStationId_dataProxInspecao_idx" ON "Jangada"("serviceStationId", "dataProxInspecao");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoExtraido_fileName_key" ON "CertificadoExtraido"("fileName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoExtraido_raftSerial_idx" ON "CertificadoExtraido"("raftSerial");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoExtraido_shipName_idx" ON "CertificadoExtraido"("shipName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoExtraido_dataInspecao_idx" ON "CertificadoExtraido"("dataInspecao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoExtraido_isMaisRecente_idx" ON "CertificadoExtraido"("isMaisRecente");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoValidade_certificadoId_idx" ON "CertificadoValidade"("certificadoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoValidade_item_idx" ON "CertificadoValidade"("item");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificadoValidade_validade_idx" ON "CertificadoValidade"("validade");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoValidade_certificadoId_item_validade_rowNumber_key" ON "CertificadoValidade"("certificadoId", "item", "validade", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Stock_codigoBarras_key" ON "Stock"("codigoBarras");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Stock_categoria_idx" ON "Stock"("categoria");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Stock_associavelJangada_idx" ON "Stock"("associavelJangada");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Stock_aplicavelMarcaJangada_idx" ON "Stock"("aplicavelMarcaJangada");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Stock_aplicavelModeloJangada_idx" ON "Stock"("aplicavelModeloJangada");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Stock_estadoCargaCilindro_idx" ON "Stock"("estadoCargaCilindro");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Stock_serviceStationId_idx" ON "Stock"("serviceStationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Stock_estadoArtigo_idx" ON "Stock"("estadoArtigo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Stock_validade_idx" ON "Stock"("validade");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Stock_referencia_serviceStationId_key" ON "Stock"("referencia", "serviceStationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomPackType_name_key" ON "CustomPackType"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomPackType_isActive_idx" ON "CustomPackType"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomPackType_name_idx" ON "CustomPackType"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomPackTypeItem_customPackTypeId_idx" ON "CustomPackTypeItem"("customPackTypeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomPackTypeItem_stockId_idx" ON "CustomPackTypeItem"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomPackTypeItem_customPackTypeId_stockReference_key" ON "CustomPackTypeItem"("customPackTypeId", "stockReference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MovimentacaoStock_stockId_idx" ON "MovimentacaoStock"("stockId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MovimentacaoStock_createdAt_idx" ON "MovimentacaoStock"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MovimentacaoStock_tipo_idx" ON "MovimentacaoStock"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Inspecao_certificadoNumero_key" ON "Inspecao"("certificadoNumero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Inspecao_numeroObra_idx" ON "Inspecao"("numeroObra");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Inspecao_navioNome_idx" ON "Inspecao"("navioNome");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Inspecao_navioId_idx" ON "Inspecao"("navioId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Inspecao_jangadaId_idx" ON "Inspecao"("jangadaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Inspecao_jangadaSerial_idx" ON "Inspecao"("jangadaSerial");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Inspecao_coleteId_idx" ON "Inspecao"("coleteId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Inspecao_coleteSerial_idx" ON "Inspecao"("coleteSerial");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Inspecao_dataInspecao_idx" ON "Inspecao"("dataInspecao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Inspecao_status_idx" ON "Inspecao"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrdemServico_numeroOrdem_key" ON "OrdemServico"("numeroOrdem");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_serviceStationId_idx" ON "OrdemServico"("serviceStationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_jangadaId_idx" ON "OrdemServico"("jangadaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_shipId_idx" ON "OrdemServico"("shipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_clienteId_idx" ON "OrdemServico"("clienteId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_tecnicoId_idx" ON "OrdemServico"("tecnicoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_inspecaoId_idx" ON "OrdemServico"("inspecaoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_status_idx" ON "OrdemServico"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_tipo_idx" ON "OrdemServico"("tipo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_prioridade_idx" ON "OrdemServico"("prioridade");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_dataAbertura_idx" ON "OrdemServico"("dataAbertura");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_dataPlaneadaInicio_idx" ON "OrdemServico"("dataPlaneadaInicio");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_dataPlaneadaFim_idx" ON "OrdemServico"("dataPlaneadaFim");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_dataPrevista_idx" ON "OrdemServico"("dataPrevista");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServico_serviceStationId_status_idx" ON "OrdemServico"("serviceStationId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoJangada_ordemServicoId_idx" ON "OrdemServicoJangada"("ordemServicoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoJangada_jangadaId_idx" ON "OrdemServicoJangada"("jangadaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrdemServicoJangada_ordemServicoId_jangadaId_key" ON "OrdemServicoJangada"("ordemServicoId", "jangadaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Tecnico_email_key" ON "Tecnico"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Tecnico_serviceStationId_idx" ON "Tecnico"("serviceStationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Tecnico_nome_idx" ON "Tecnico"("nome");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Tecnico_ativo_idx" ON "Tecnico"("ativo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TecnicoAusencia_tecnicoKey_idx" ON "TecnicoAusencia"("tecnicoKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TecnicoAusencia_dataInicio_idx" ON "TecnicoAusencia"("dataInicio");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TecnicoAusencia_dataFim_idx" ON "TecnicoAusencia"("dataFim");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TecnicoAusencia_tecnicoId_idx" ON "TecnicoAusencia"("tecnicoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoChecklistItem_ordemServicoId_idx" ON "OrdemServicoChecklistItem"("ordemServicoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoChecklistItem_phase_idx" ON "OrdemServicoChecklistItem"("phase");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoChecklistItem_category_idx" ON "OrdemServicoChecklistItem"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoChecklistItem_updatedById_idx" ON "OrdemServicoChecklistItem"("updatedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoTempo_ordemServicoId_idx" ON "OrdemServicoTempo"("ordemServicoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoTempo_tecnicoId_idx" ON "OrdemServicoTempo"("tecnicoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoTempo_startedAt_idx" ON "OrdemServicoTempo"("startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoLog_ordemServicoId_idx" ON "OrdemServicoLog"("ordemServicoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoLog_at_idx" ON "OrdemServicoLog"("at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoLog_type_idx" ON "OrdemServicoLog"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemServicoLog_tecnicoId_idx" ON "OrdemServicoLog"("tecnicoId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Fatura_numeroFatura_key" ON "Fatura"("numeroFatura");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Fatura_clienteId_idx" ON "Fatura"("clienteId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Fatura_dataEmissao_idx" ON "Fatura"("dataEmissao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Fatura_pagamentoStatus_idx" ON "Fatura"("pagamentoStatus");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FaturaOrdemServico_ordemServicoId_key" ON "FaturaOrdemServico"("ordemServicoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FaturaOrdemServico_faturaId_idx" ON "FaturaOrdemServico"("faturaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FaturaOrdemServico_faturaId_ordemServicoId_key" ON "FaturaOrdemServico"("faturaId", "ordemServicoId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotaCredito_numeroNotaCredito_key" ON "NotaCredito"("numeroNotaCredito");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotaCredito_faturaId_key" ON "NotaCredito"("faturaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Recibo_numeroRecibo_key" ON "Recibo"("numeroRecibo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recibo_faturaId_idx" ON "Recibo"("faturaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Equipamento_serial_key" ON "Equipamento"("serial");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Equipamento_nome_idx" ON "Equipamento"("nome");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Equipamento_estado_idx" ON "Equipamento"("estado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceStationQueue_serviceStationId_idx" ON "ServiceStationQueue"("serviceStationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceStationQueue_jangadaId_idx" ON "ServiceStationQueue"("jangadaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceStationQueue_ordemServicoId_idx" ON "ServiceStationQueue"("ordemServicoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceStationQueue_status_idx" ON "ServiceStationQueue"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Auditoria_tabela_idx" ON "Auditoria"("tabela");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Auditoria_tipoOperacao_idx" ON "Auditoria"("tipoOperacao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Auditoria_createdAt_idx" ON "Auditoria"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Auditoria_usuario_idx" ON "Auditoria"("usuario");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificacaoFabricanteTecnico_tecnicoId_idx" ON "CertificacaoFabricanteTecnico"("tecnicoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CertificacaoFabricanteTecnico_fabricante_idx" ON "CertificacaoFabricanteTecnico"("fabricante");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CalibracaoEquipamento_referencia_key" ON "CalibracaoEquipamento"("referencia");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibracaoEquipamento_referencia_idx" ON "CalibracaoEquipamento"("referencia");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MovimentoEquipamento_equipamentoId_idx" ON "MovimentoEquipamento"("equipamentoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MovimentoEquipamento_data_idx" ON "MovimentoEquipamento"("data");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MovimentoEquipamento_tipoEquipamento_equipamentoId_idx" ON "MovimentoEquipamento"("tipoEquipamento", "equipamentoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Custo_tipo_idx" ON "Custo"("tipo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Custo_data_idx" ON "Custo"("data");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Custo_serviceStationId_idx" ON "Custo"("serviceStationId");

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


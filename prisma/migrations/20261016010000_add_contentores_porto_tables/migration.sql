CREATE TABLE "PortoEscala" (
    "id" SERIAL NOT NULL,
    "navioNome" TEXT NOT NULL,
    "matricula" TEXT,
    "tipoCarga" TEXT,
    "armador" TEXT,
    "cais" TEXT,
    "dataChegada" TIMESTAMP(3),
    "dataPartida" TIMESTAMP(3),
    "origemDestino" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Previsto',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortoEscala_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NavioContentorRoute" (
    "id" SERIAL NOT NULL,
    "navioNome" TEXT NOT NULL,
    "operador" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "frequencia" TEXT,
    "capacidadeTeus" INTEGER,
    "diasEscala" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavioContentorRoute_pkey" PRIMARY KEY ("id")
);

const es = {
  common: {
    appName: 'El Impostor',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    loading: 'Cargando...',
    error: 'Error',
    retry: 'Reintentar',
    back: 'Volver',
    close: 'Cerrar',
  },

  connection: {
    connecting: 'Conectando al servidor...',
    connected: 'Conectado',
    disconnected: 'Desconectado',
    reconnecting: 'Reconectando...',
    connectionLost: 'Conexión perdida. Reconectando...',
    serverError: 'Error del servidor',
  },

  lobby: {
    title: 'Sala de Espera',
    createRoom: 'Crear Sala',
    joinRoom: 'Unirse a Sala',
    roomCode: 'Código de Sala',
    username: 'Nombre de Usuario',
    enterUsername: 'Ingresa tu nombre',
    enterRoomCode: 'Ingresa el código',
    create: 'Crear',
    join: 'Unirse',
    players: 'Jugadores',
    playerCount: '{count}/{max} jugadores',
    host: 'Anfitrión',
    you: 'Tú',
    settings: 'Configuración',
    impostors: 'Impostores',
    discussionTime: 'Tiempo de discusión',
    seconds: 'segundos',
    startMatch: 'Iniciar Partida',
    minPlayersRequired: 'Se necesitan al menos {min} jugadores',
    startError: 'Error al iniciar la partida',
    copyCode: 'Copiar código',
    codeCopied: '¡Código copiado!',
  },

  discussion: {
    title: 'Discusión',
    wordHint: 'La palabra es:',
    youAreImpostor: 'Eres el impostor',
    youAreSpectator: 'Eres espectador',
    category: 'Categoría',
    timeRemaining: 'Tiempo restante',
    lobbyLink: 'Volver a sala',
    waitingForVoting: 'Esperando a que termine la discusión...',
  },

  voting: {
    title: 'Votación',
    voteFor: 'Votar a',
    skip: 'Saltar voto',
    voted: 'Votaste',
    voteCount: '{count}/{total} votaron',
    waitingForVotes: 'Esperando votos...',
    selectTarget: 'Selecciona a quién expulsar',
    confirmVote: '¿Expulsar a {player}?',
    alreadyVoted: 'Ya votaste',
    disabledSpectator: 'Los espectadores no pueden votar',
    phaseInfo: 'Fase de Votación',
  },

  evaluation: {
    title: 'Resultado',
    expelled: '{player} fue expulsado',
    expelledWasImpostor: '{player} ERA el impostor',
    expelledWasNotImpostor: '{player} NO era el impostor',
    noOneExpelled: 'Nadie fue expulsado',
    wasATie: 'Hubo un empate',
    allSkipped: 'Todos saltaron el voto',
    aliveInfo: '{impostors} impostores vivos — {nonImpostors} no impostores',
    nextRound: 'Siguiente ronda',
    autoTransition: 'La siguiente ronda comienza en breve...',
  },

  gameOver: {
    title: '¡Fin de la Partida!',
    nonImpostorsWin: '¡Los NO impostores ganan!',
    impostorsWin: '¡Los impostores ganan!',
    roundsPlayed: 'Rondas jugadas',
    impostorWas: 'El impostor era',
    playAgain: 'Jugar de nuevo',
    backToLobby: 'Volver a la sala',
    hostOnly: 'Solo el anfitrión puede iniciar una nueva partida',
  },

  errors: {
    roomNotFound: 'Sala no encontrada',
    roomFull: 'La sala está llena',
    roomCodeTaken: 'El código de sala ya está en uso',
    usernameTaken: 'El nombre de usuario ya está en uso',
    minPlayers: 'Se necesitan al menos {min} jugadores',
    invalidImpostorCount: 'Máximo {max} impostor(es) para {players} jugadores',
    noWords: 'No hay palabras disponibles',
    generic: 'Algo salió mal',
  },
} as const;

export default es;
export type TranslationKeys = keyof typeof es;
export type NestedKeys = {
  [K in keyof typeof es]: keyof (typeof es)[K];
};

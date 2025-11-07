// Chess Engine WebAssembly Wrapper for Chess.com
// This file handles the WebAssembly module loading and provides a clean JavaScript interface

class ChessEngineWASM {
  constructor() {
    this.module = null;
    this.isReady = false;
    this.isInitialized = false;

    // Function wrappers
    this.chess_init = null;
    this.chess_cleanup = null;
    this.chess_set_position = null;
    this.chess_get_best_move = null;
    this.chess_make_move = null;
    this.chess_undo_move = null;
    this.chess_get_legal_moves = null;
    this.chess_is_checkmate = null;
    this.chess_is_stalemate = null;
    this.chess_is_in_check = null;
    this.chess_evaluate_position = null;
    this.chess_get_fen = null;
  }

  async loadModule(baseUrl = "./") {
    try {
      console.log("🔄 Loading chess engine WASM module...");

      // Normalize the base URL
      const normalizedBaseUrl = baseUrl.endsWith("/")
        ? baseUrl.slice(0, -1)
        : baseUrl;
      const jsUrl = `${normalizedBaseUrl}/chess_wasm.js`;
      const wasmFileUrl = `${normalizedBaseUrl}/chess_wasm.wasm`;

      console.log(`📁 Loading JS from: ${jsUrl}`);
      console.log(`📁 WASM file URL: ${wasmFileUrl}`);

      // Load the script using script tag instead of dynamic import to avoid CORS issues
      await this.loadScript(jsUrl);

      // Access the global ChessEngine function (not Module)
      if (typeof ChessEngine === "undefined") {
        throw new Error("chess_wasm.js did not expose ChessEngine function");
      }

      console.log("🔧 Initializing ChessEngine module...");

      // Initialize the WebAssembly module using ChessEngine
      this.module = await ChessEngine({
        locateFile: (path, prefix) => {
          if (path.endsWith(".wasm")) {
            console.log(`🎯 Locating WASM file: ${wasmFileUrl}`);
            return wasmFileUrl;
          }
          return prefix + path;
        },
      });

      console.log("✅ WASM module loaded successfully");

      // Wrap the C functions
      this.setupFunctionWrappers();

      this.isReady = true;
      console.log("🚀 Chess engine ready for use");

      return true;
    } catch (error) {
      console.error("❌ Failed to load WASM module:", error);
      return false;
    }
  }

  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  setupFunctionWrappers() {
    const Module = this.module;

    // Initialize/cleanup
    this.chess_init = Module.cwrap("chess_init", "number", []);
    this.chess_cleanup = Module.cwrap("chess_cleanup", null, []);

    // Position management
    this.chess_set_position = Module.cwrap("chess_set_position", "number", [
      "string",
    ]);
    this.chess_get_fen = Module.cwrap("chess_get_fen", "string", []);

    // Move operations
    this.chess_get_best_move = Module.cwrap("chess_get_best_move", "string", [
      "number",
    ]);
    this.chess_make_move = Module.cwrap("chess_make_move", "number", [
      "string",
    ]);
    this.chess_undo_move = Module.cwrap("chess_undo_move", "number", []);
    this.chess_get_legal_moves = Module.cwrap(
      "chess_get_legal_moves",
      "string",
      []
    );

    // Game state
    this.chess_is_checkmate = Module.cwrap("chess_is_checkmate", "number", []);
    this.chess_is_stalemate = Module.cwrap("chess_is_stalemate", "number", []);
    this.chess_is_in_check = Module.cwrap("chess_is_in_check", "number", []);
    this.chess_evaluate_position = Module.cwrap(
      "chess_evaluate_position",
      "number",
      []
    );
  }

  // High-level API methods
  async init() {
    if (!this.isReady) {
      throw new Error("WASM module not loaded yet");
    }

    const result = this.chess_init();
    this.isInitialized = result === 1;
    return this.isInitialized;
  }

  cleanup() {
    if (this.isInitialized && this.chess_cleanup) {
      this.chess_cleanup();
      this.isInitialized = false;
    }
  }

  setPosition(fen) {
    if (!this.isInitialized) throw new Error("Engine not initialized");
    return this.chess_set_position(fen) === 1;
  }

  getBestMove(depth = 4) {
    if (!this.isInitialized) throw new Error("Engine not initialized");
    const move = this.chess_get_best_move(depth);
    return move && move !== "0000" ? move : null;
  }

  makeMove(move) {
    if (!this.isInitialized) throw new Error("Engine not initialized");
    return this.chess_make_move(move) === 1;
  }

  undoMove() {
    if (!this.isInitialized) throw new Error("Engine not initialized");
    return this.chess_undo_move() === 1;
  }

  getLegalMoves() {
    if (!this.isInitialized) throw new Error("Engine not initialized");
    const movesStr = this.chess_get_legal_moves();
    return movesStr ? movesStr.split(",").filter((m) => m.length > 0) : [];
  }

  isCheckmate() {
    if (!this.isInitialized) throw new Error("Engine not initialized");
    return this.chess_is_checkmate() === 1;
  }

  isStalemate() {
    if (!this.isInitialized) throw new Error("Engine not initialized");
    return this.chess_is_stalemate() === 1;
  }

  isInCheck() {
    if (!this.isInitialized) throw new Error("Engine not initialized");
    return this.chess_is_in_check() === 1;
  }

  evaluatePosition() {
    if (!this.isInitialized) throw new Error("Engine not initialized");
    return this.chess_evaluate_position();
  }

  getCurrentFen() {
    if (!this.isInitialized) throw new Error("Engine not initialized");
    return this.chess_get_fen();
  }

  // Comprehensive analysis method
  async analyzePosition(fen, depth = 4) {
    try {
      if (!this.setPosition(fen)) {
        return { error: "Invalid FEN position" };
      }

      const bestMove = this.getBestMove(depth);
      const evaluation = this.evaluatePosition();
      const legalMoves = this.getLegalMoves();
      const isCheckmate = this.isCheckmate();
      const isStalemate = this.isStalemate();
      const isInCheck = this.isInCheck();

      return {
        success: true,
        bestMove,
        evaluation,
        legalMoves,
        moveCount: legalMoves.length,
        gameState: {
          isCheckmate,
          isStalemate,
          isInCheck,
        },
        depth,
        fen: this.getCurrentFen(),
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

// Global instance
window.ChessEngineWASM = ChessEngineWASM;

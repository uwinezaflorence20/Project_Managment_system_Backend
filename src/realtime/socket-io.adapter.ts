import { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigin: string[] | boolean,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    const serverOptions: Partial<ServerOptions> = {
      ...options,
      cors: {
        origin: this.corsOrigin,
        credentials: true,
      },
    };
    return super.createIOServer(port, serverOptions as ServerOptions);
  }
}

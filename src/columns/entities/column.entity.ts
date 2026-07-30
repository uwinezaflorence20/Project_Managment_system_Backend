import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Board } from "../../boards/entities/board.entity";
import { Task } from "../../tasks/entities/task.entity";

@Entity("board_columns")
export class BoardColumn {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  title: string;

  @Column({ default: 0 })
  order: number;

  @ManyToOne(() => Board, (board) => board.columns, { onDelete: "CASCADE" })
  @JoinColumn({ name: "boardId" })
  board: Board;

  @Column()
  boardId: string;

  @OneToMany(() => Task, (task) => task.column, { cascade: true })
  tasks: Task[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

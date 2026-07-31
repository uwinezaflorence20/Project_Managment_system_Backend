import {
  Column as OrmColumn,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";
import { BoardColumn } from "../../columns/entities/column.entity";
import { BoardMember } from "./board-member.entity";

@Entity("boards")
export class Board {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @OrmColumn()
  title: string;

  @OrmColumn({ nullable: true, type: "text" })
  description?: string;

  @ManyToOne(() => User, (user) => user.boards, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ownerId" })
  owner: User;

  @OrmColumn()
  ownerId: string;

  @OneToMany(() => BoardColumn, (column) => column.board, { cascade: true })
  columns: BoardColumn[];

  @OneToMany(() => BoardMember, (member) => member.board, { cascade: true })
  members: BoardMember[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

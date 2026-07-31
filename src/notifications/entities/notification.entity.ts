import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";

export enum NotificationType {
  TASK_ASSIGNED = "task_assigned",
  BOARD_ADDED = "board_added",
  TASK_DUE_SOON = "task_due_soon",
  TASK_OVERDUE = "task_overdue",
}

@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column()
  userId: string;

  @Column({ type: "enum", enum: NotificationType })
  type: NotificationType;

  @Column()
  message: string;

  @Column({ nullable: true })
  boardId?: string;

  @Column({ nullable: true })
  taskId?: string;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

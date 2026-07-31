import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Task } from "./task.entity";
import { User } from "../../users/entities/user.entity";

@Entity("task_assignees")
@Unique(["taskId", "userId"])
export class TaskAssignee {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Task, (task) => task.assignees, { onDelete: "CASCADE" })
  @JoinColumn({ name: "taskId" })
  task: Task;

  @Column()
  taskId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column()
  userId: string;

  @CreateDateColumn()
  createdAt: Date;
}

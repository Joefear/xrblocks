import type {JointName} from '../../input/Hands';

export type SimulatorHandPoseJoints = {
  t: number[];
  r: number[];
  s?: number[];
}[];

export type SimulatorHandJointRotationArray = [number, number, number];

export type SimulatorHandPoseRotations = Partial<
  Record<JointName, SimulatorHandJointRotationArray>
>;

import { Types } from 'mongoose';
import { Activity, Team, User, Workout } from '../models/index.js';

type HttpError = Error & { status: number };

function httpError(status: number, message: string): HttpError {
  return Object.assign(new Error(message), { status });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function isObjectId(input: unknown): input is string {
  return typeof input === 'string' && Types.ObjectId.isValid(input);
}

export async function listActivities() {
  return Activity.find().lean();
}

export async function createActivity(input: unknown) {
  if (!isRecord(input)) throw httpError(400, 'Activity details are required');

  const { userId, teamId, type, minutes } = input;
  if (!isObjectId(userId) || !isObjectId(teamId)) {
    throw httpError(400, 'Valid userId and teamId are required');
  }
  if (typeof type !== 'string' || type.trim().length === 0) {
    throw httpError(400, 'Activity type is required');
  }
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    throw httpError(400, 'Activity minutes must be a positive number');
  }

  const [user, team] = await Promise.all([
    User.findById(userId).select('_id').lean(),
    Team.findById(teamId).select('_id').lean(),
  ]);
  if (!user || !team) throw httpError(404, 'User or team not found');

  const activity = await Activity.create({
    user: user._id,
    team: team._id,
    type: type.trim(),
    minutes,
    points: minutes,
    occurredAt: new Date(),
  });
  return activity.toObject();
}

export async function listTeams() {
  return Team.find().lean();
}

export async function createTeam(input: unknown) {
  if (!isRecord(input)) throw httpError(400, 'Team details are required');

  const { name, mascot, members } = input;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw httpError(400, 'Team name is required');
  }
  if (typeof mascot !== 'string' || mascot.trim().length === 0) {
    throw httpError(400, 'Team mascot is required');
  }

  if (members !== undefined && !Array.isArray(members)) {
    throw httpError(400, 'Team members must be an array of user IDs');
  }
  const memberIds = (members ?? []) as unknown[];
  if (!memberIds.every(isObjectId)) {
    throw httpError(400, 'Team members must contain valid user IDs');
  }
  const uniqueMemberIds = [...new Set(memberIds)];
  if (uniqueMemberIds.length > 0) {
    const existingMembers = await User.countDocuments({ _id: { $in: uniqueMemberIds } });
    if (existingMembers !== uniqueMemberIds.length) {
      throw httpError(400, 'All team members must reference existing users');
    }
  }

  const team = await Team.create({
    name: name.trim(),
    mascot: mascot.trim(),
    members: uniqueMemberIds,
  });
  return team.toObject();
}

export async function getLeaderboard() {
  const [teams, totals] = await Promise.all([
    Team.find().select('name').lean(),
    Activity.aggregate<{ _id: Types.ObjectId; totalPoints: number }>([
      { $group: { _id: '$team', totalPoints: { $sum: '$points' } } },
    ]),
  ]);
  const pointsByTeam = new Map(totals.map(({ _id, totalPoints }) => [_id.toString(), totalPoints]));

  return teams
    .map((team) => ({
      teamName: team.name,
      totalPoints: pointsByTeam.get(team._id.toString()) ?? 0,
    }))
    .sort((left, right) => right.totalPoints - left.totalPoints || left.teamName.localeCompare(right.teamName))
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

function focusForActivity(type: string): string {
  const normalizedType = type.toLowerCase();
  if (normalizedType === 'run' || normalizedType === 'cycle') return 'endurance';
  if (normalizedType === 'strength') return 'strength';
  if (normalizedType === 'walk' || normalizedType === 'stretch' || normalizedType === 'mobility') return 'mobility';
  return normalizedType;
}

export async function suggestWorkouts(userEmail: string) {
  const user = await User.findOne({ email: userEmail }).lean();
  if (!user) throw httpError(404, 'User not found');

  const [activities, workouts] = await Promise.all([
    Activity.find({ user: user._id }).sort({ occurredAt: -1 }).limit(5).lean(),
    Workout.find().lean(),
  ]);
  const goalFocus = user.fitnessGoal.toLowerCase();
  const recentActivity = activities[0];
  const activityFocus = recentActivity ? focusForActivity(recentActivity.type) : undefined;
  const workoutFocuses = new Set(workouts.map(({ focus }) => focus.toLowerCase()));
  const preferredFocus = workoutFocuses.has(goalFocus)
    ? goalFocus
    : activityFocus && workoutFocuses.has(activityFocus)
      ? activityFocus
      : goalFocus;
  const reason = recentActivity
    ? `Supports your ${user.fitnessGoal} goal and recent ${recentActivity.type} activity.`
    : `Supports your ${user.fitnessGoal} fitness goal.`;

  return workouts
    .sort((left, right) => {
      const leftMatches = left.focus.toLowerCase() === preferredFocus;
      const rightMatches = right.focus.toLowerCase() === preferredFocus;
      if (leftMatches !== rightMatches) return leftMatches ? -1 : 1;
      return left.title.localeCompare(right.title);
    })
    .map((workout) => ({ ...workout, reason }));
}

export { User };

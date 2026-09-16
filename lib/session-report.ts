export type SessionReportParticipant = {
  id: string;
  displayName: string;
  joinedAt: string;
  teamId: string | null;
  teamName: string | null;
};

export type SessionReportChoiceBlock = {
  kind: 'choice';
  blockId: string;
  blockIndex: number;
  type: 'poll' | 'quiz';
  title: string;
  responseCount: number;
  revealed: boolean;
  options: Array<{ option: string; count: number }>;
  correctAnswer?: string;
  correctCount?: number;
  responses: Array<{
    participantId: string;
    displayName: string;
    choice: string;
    isCorrect?: boolean;
  }>;
};

export type SessionReportTextBlock = {
  kind: 'text';
  blockId: string;
  blockIndex: number;
  type: 'open_text' | 'exit_ticket';
  title: string;
  responseCount: number;
  responses: Array<{
    participantId: string;
    displayName: string;
    text: string;
  }>;
};

export type SessionReportRankingBlock = {
  kind: 'ranking';
  blockId: string;
  blockIndex: number;
  type: 'ranking';
  title: string;
  responseCount: number;
  ranking: Array<{ item: string; average: number | null; sourceIndex: number }>;
  responses: Array<{
    participantId: string;
    displayName: string;
    ranking: string[];
    text: string;
  }>;
};

export type SessionReportTeamBlock = {
  kind: 'team';
  blockId: string;
  blockIndex: number;
  type: 'team_task';
  title: string;
  responseCount: number;
  responses: Array<{
    teamId: string;
    teamName: string;
    text: string | null;
    updatedByDisplayName: string | null;
  }>;
};

export type SessionReportBlock =
  | SessionReportChoiceBlock
  | SessionReportTextBlock
  | SessionReportRankingBlock
  | SessionReportTeamBlock;

export type SessionReportData = {
  sessionId: string;
  lessonId: string | null;
  title: string;
  joinCode: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  participantCount: number;
  interactiveBlockCount: number;
  answeredBlockCount: number;
  totalResponses: number;
  participants: SessionReportParticipant[];
  blocks: SessionReportBlock[];
};

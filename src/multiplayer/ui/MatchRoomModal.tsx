import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { IdentityEditor } from "src/components/level-editor/collab/IdentityEditor";
import { RoomCodeDisplay } from "src/components/level-editor/collab/RoomCodeDisplay";
import {
  CollabIdentity,
  ROOM_CODE_LENGTH,
  isValidRoomCode,
  normalizeRoomCode
} from "src/components/level-editor/collab/collabTypes";
import {
  loadStoredIdentity,
  storeIdentity
} from "src/components/level-editor/collab/identityStorage";
import { BaseModal } from "src/components/modals/BaseModal";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { closeCurrentModal } from "src/redux/ui/slice";

import { multiplayerSession } from "../MultiplayerSession";
import { selectMatchPhase } from "../match/selectors";
import { PROTOCOL_VERSION } from "../net/protocol";
import { useMultiplayerSnapshot } from "./useMultiplayerSnapshot";

/** Levels offered as PvP arenas in the lobby. */
const MATCH_LEVELS: { id: string; label: string }[] = [
  { id: "TwoPlatforms", label: "Two Platforms" },
  { id: "DebugPlayground", label: "Debug Playground" },
  { id: "Demo_1_1", label: "Demo Level" }
];

/** The multiplayer entry point: identity, then Host / Join, then the lobby
 *  with the member list, ready-up, and (for the host) level select + Start. */
export function MatchRoomModal(props: ModalComponentPropsType<"mpRoom">) {
  const { opening, closing } = props;
  const dispatch = useAppDispatch();
  const snapshot = useMultiplayerSnapshot();
  const matchPhase = useAppSelector(selectMatchPhase);
  const [identity, setIdentity] = useState<CollabIdentity>(loadStoredIdentity);
  const [tab, setTab] = useState<"host" | "join">("host");
  const [joinCode, setJoinCode] = useState("");
  const [levelId, setLevelId] = useState(MATCH_LEVELS[0].id);

  useEffect(() => {
    multiplayerSession.clearJoinError();
  }, []);

  const closeModal = useCallback(() => {
    dispatch(closeCurrentModal());
  }, [dispatch]);

  // Close the modal the moment a match actually starts loading.
  const startedRef = useRef(false);
  useEffect(() => {
    if (matchPhase !== "idle" && !startedRef.current) {
      startedRef.current = true;
      closeModal();
    }
  }, [matchPhase, closeModal]);

  const updateIdentity = useCallback(
    (next: CollabIdentity) => {
      setIdentity(next);
      storeIdentity(next);
      if (multiplayerSession.getPhase() === "lobby") {
        multiplayerSession.updateIdentity(next);
      }
    },
    []
  );

  const identityReady = identity.name.trim().length > 0;
  const normalizedCode = normalizeRoomCode(joinCode);
  const joinReady = identityReady && isValidRoomCode(normalizedCode);

  const trimmedIdentity = useCallback(
    (): CollabIdentity => ({ ...identity, name: identity.name.trim() }),
    [identity]
  );

  const onHost = useCallback(() => {
    if (!identityReady) return;
    void multiplayerSession.host(trimmedIdentity());
  }, [identityReady, trimmedIdentity]);

  const onJoin = useCallback(() => {
    if (!joinReady) return;
    void multiplayerSession.join(normalizedCode, trimmedIdentity());
  }, [joinReady, normalizedCode, trimmedIdentity]);

  const onLeave = useCallback(() => {
    multiplayerSession.leave();
  }, []);

  const selfMember = snapshot.members.find((m) => m.isSelf);
  const selfReady = selfMember?.state.ready ?? false;
  const canStart =
    snapshot.isCreator &&
    snapshot.members.length > 1 &&
    snapshot.allPeersReady;

  const joining = snapshot.phase === "connecting";
  const inLobby = snapshot.phase === "lobby";

  const title = joining
    ? "Joining room"
    : inLobby
      ? "Match lobby"
      : "Multiplayer match";

  return (
    <BaseModal
      title={title}
      size="medium"
      fitContent
      opening={opening}
      closing={closing}
    >
      {joining ? (
        <Stack spacing={2.5} alignItems="center" sx={{ width: "100%", py: 2 }}>
          <RoomCodeDisplay code={normalizedCode} />
          <Stack spacing={1.5} alignItems="center">
            <CircularProgress size={22} />
            <Typography variant="body2" color="text.secondary">
              Looking for the room...
            </Typography>
          </Stack>
          <Button color="inherit" onClick={onLeave}>
            Cancel
          </Button>
        </Stack>
      ) : inLobby ? (
        <Stack spacing={2} sx={{ width: "100%" }}>
          {snapshot.signalingDown && (
            <Alert severity="warning">
              Can't reach the connection servers right now, so nobody new will
              be able to join.
            </Alert>
          )}
          <Stack spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Share this code to invite players:
            </Typography>
            <RoomCodeDisplay code={snapshot.roomCode ?? ""} />
          </Stack>
          <Stack spacing={0.75}>
            {snapshot.members.map((member) => {
              const incompatible =
                member.state.protocolVersion !== PROTOCOL_VERSION;
              return (
                <Stack
                  key={member.peerId}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: "action.hover" }}
                >
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      bgcolor: member.state.identity.color
                    }}
                  />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {member.state.identity.name}
                    {member.isSelf ? " (you)" : ""}
                  </Typography>
                  {incompatible ? (
                    <Typography variant="caption" color="error">
                      incompatible version
                    </Typography>
                  ) : (
                    <Typography
                      variant="caption"
                      color={member.state.ready ? "success.main" : "text.secondary"}
                    >
                      {member.state.ready ? "Ready" : "Not ready"}
                    </Typography>
                  )}
                </Stack>
              );
            })}
          </Stack>
          {snapshot.isCreator ? (
            <Stack spacing={1.5}>
              <Select
                size="small"
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
              >
                {MATCH_LEVELS.map((level) => (
                  <MenuItem key={level.id} value={level.id}>
                    {level.label}
                  </MenuItem>
                ))}
              </Select>
              <Button
                variant="contained"
                disabled={!canStart}
                onClick={() => multiplayerSession.startMatch(levelId)}
                data-testid="mp-start-match"
              >
                {snapshot.members.length <= 1
                  ? "Waiting for players..."
                  : canStart
                    ? "Start Match"
                    : "Waiting for everyone to ready up..."}
              </Button>
            </Stack>
          ) : (
            <FormControlLabel
              control={
                <Checkbox
                  checked={selfReady}
                  onChange={(e) => multiplayerSession.setReady(e.target.checked)}
                  data-testid="mp-ready"
                />
              }
              label="Ready"
            />
          )}
          <Stack direction="row" justifyContent="space-between">
            <Button color="inherit" onClick={onLeave}>
              Leave room
            </Button>
            <Button color="inherit" onClick={closeModal}>
              Close
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={2} sx={{ width: "100%" }}>
          <IdentityEditor identity={identity} onChange={updateIdentity} />
          <Tabs
            value={tab}
            onChange={(_, next) => setTab(next)}
            variant="fullWidth"
            sx={{ minHeight: 38, borderBottom: 1, borderColor: "divider" }}
          >
            <Tab
              label="Host a match"
              value="host"
              sx={{ minHeight: 38, textTransform: "none" }}
              data-testid="mp-tab-host"
            />
            <Tab
              label="Join a match"
              value="join"
              sx={{ minHeight: 38, textTransform: "none" }}
              data-testid="mp-tab-join"
            />
          </Tabs>
          {tab === "host" ? (
            <Stack spacing={1.5} sx={{ px: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Starts a room other players can join with a code.
              </Typography>
              <Button
                variant="contained"
                disabled={!identityReady}
                onClick={onHost}
                data-testid="mp-host"
              >
                Host
              </Button>
            </Stack>
          ) : (
            <Stack spacing={1.5} sx={{ px: 0.5 }}>
              <TextField
                size="small"
                label="Room code"
                value={joinCode}
                autoFocus
                onChange={(e) =>
                  setJoinCode(
                    normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH)
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") onJoin();
                }}
                slotProps={{
                  htmlInput: {
                    sx: {
                      fontFamily: "monospace",
                      letterSpacing: 2,
                      textTransform: "uppercase"
                    }
                  }
                }}
              />
              <Button
                variant="contained"
                disabled={!joinReady}
                onClick={onJoin}
                data-testid="mp-join"
              >
                Join
              </Button>
            </Stack>
          )}
          {snapshot.joinError && (
            <Alert severity="error">{snapshot.joinError}</Alert>
          )}
        </Stack>
      )}
    </BaseModal>
  );
}

export const MatchRoomModalDefinition: ModalDefinitionType<"mpRoom"> = {
  modalName: "mpRoom",
  component: MatchRoomModal
};

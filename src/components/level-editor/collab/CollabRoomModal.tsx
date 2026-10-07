import {
  Alert,
  Button,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { BaseModal } from "src/components/modals/BaseModal";
import { useAppDispatch } from "src/redux/hooks";
import { closeCurrentModal } from "src/redux/ui/slice";

import { levelEditorStore } from "../LevelEditorStore";
import { saveCurrentEditorState } from "../editorMapActions";
import { useLevelEditorSelector } from "../useLevelEditorStore";
import { IdentityEditor } from "./IdentityEditor";
import { RoomCodeDisplay } from "./RoomCodeDisplay";
import {
  BUILD_ID,
  VersionCheckResult,
  checkDeployedVersion
} from "./buildIdentity";
import {
  CollabIdentity,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode
} from "./collabTypes";
import { loadStoredIdentity, storeIdentity } from "./identityStorage";
import { levelEditorSession } from "./session";
import { useSessionSnapshot } from "./useSessionSnapshot";

function VersionWarning({ check }: { check: VersionCheckResult | null }) {
  if (!check || check.kind === "current" || check.kind === "unavailable") {
    return null;
  }
  if (check.kind === "stale") {
    return (
      <Alert
        severity="warning"
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => window.location.reload()}
          >
            Refresh
          </Button>
        }
      >
        A newer version has been deployed ({check.deployedBuildId}). Refresh
        before joining so everyone sees the same content.
      </Alert>
    );
  }
  return (
    <Alert severity="info">
      {`You're on a dev build (${BUILD_ID}); content you place may not display for others.`}
    </Alert>
  );
}

/** The room entry point: identity on top, then a Host / Join tab pair. Both
 *  hosting and joining take over the whole modal once they start; a join with
 *  unsaved local edits interposes a save prompt first. */
export function CollabRoomModal(props: ModalComponentPropsType<"collabRoom">) {
  const { opening, closing } = props;
  const dispatch = useAppDispatch();
  const session = useSessionSnapshot();
  const [identity, setIdentity] = useState<CollabIdentity>(loadStoredIdentity);
  const [tab, setTab] = useState<"host" | "join">("host");
  const [joinCode, setJoinCode] = useState("");
  const [versionCheck, setVersionCheck] = useState<VersionCheckResult | null>(
    null
  );
  const [unsavedGuardOpen, setUnsavedGuardOpen] = useState(false);
  const [saveBeforeJoinFailed, setSaveBeforeJoinFailed] = useState(false);
  const [slowJoin, setSlowJoin] = useState(false);

  const levelName = useLevelEditorSelector(
    (s) => s.getState().levelName,
    ["metadataChanged"]
  );

  useEffect(() => {
    levelEditorSession.clearJoinError();
    // Advisory only; a failed fetch shows nothing and blocks nothing.
    void checkDeployedVersion().then(setVersionCheck);
  }, []);

  useEffect(() => {
    if (session.phase !== "connecting") {
      setSlowJoin(false);
      return;
    }
    const timer = setTimeout(() => setSlowJoin(true), 10_000);
    return () => clearTimeout(timer);
  }, [session.phase]);

  // A failed join drops back to the setup view; land on the tab the error
  // belongs to.
  useEffect(() => {
    if (session.joinError) setTab("join");
  }, [session.joinError]);

  const closeModal = useCallback(() => {
    dispatch(closeCurrentModal());
  }, [dispatch]);

  const updateIdentity = useCallback((next: CollabIdentity) => {
    setIdentity(next);
    storeIdentity(next);
  }, []);

  const identityReady = identity.name.trim().length > 0;
  const normalizedCode = normalizeRoomCode(joinCode);
  const joinReady = identityReady && isValidRoomCode(normalizedCode);

  const trimmedIdentity = useCallback(
    (): CollabIdentity => ({ ...identity, name: identity.name.trim() }),
    [identity]
  );

  const onHost = useCallback(() => {
    if (!identityReady) return;
    levelEditorSession.host(generateRoomCode(), trimmedIdentity());
  }, [identityReady, trimmedIdentity]);

  const startJoin = useCallback(() => {
    levelEditorSession.join(normalizedCode, trimmedIdentity());
  }, [normalizedCode, trimmedIdentity]);

  // Joining adopts the room's document and replaces the editor contents, so
  // unsaved local edits get one chance to land in a save first.
  const onJoin = useCallback(() => {
    if (!joinReady) return;
    if (levelEditorStore.isDirty()) {
      setSaveBeforeJoinFailed(false);
      setUnsavedGuardOpen(true);
      return;
    }
    startJoin();
  }, [joinReady, startJoin]);

  const onSaveAndJoin = useCallback(() => {
    // Joining replaces the editor contents; if the save did not actually
    // persist, proceeding would destroy the edits the user asked to keep.
    if (!saveCurrentEditorState()) {
      setSaveBeforeJoinFailed(true);
      return;
    }
    setUnsavedGuardOpen(false);
    startJoin();
  }, [startJoin]);

  const onCancelJoin = useCallback(() => {
    levelEditorSession.leave();
  }, []);

  // Close automatically once a join lands (the host stays to see the code).
  // A cancelled or failed join resets the flag, or a later Host would close
  // the modal before the code screen ever shows.
  const wasConnecting = useRef(false);
  useEffect(() => {
    if (session.phase === "connecting") {
      wasConnecting.current = true;
    } else if (session.phase === "in-room" && wasConnecting.current) {
      wasConnecting.current = false;
      closeModal();
    } else if (session.phase === "idle") {
      wasConnecting.current = false;
    }
  }, [session.phase, closeModal]);

  const joining = session.phase === "connecting";
  const showCodeScreen =
    session.phase === "in-room" && levelEditorSession.isCreator();

  const title = joining
    ? "Joining room"
    : showCodeScreen
      ? "Room started"
      : unsavedGuardOpen
        ? "Save your level first?"
        : "Collaborate in a room";

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
            <Typography
              variant="body2"
              color="text.secondary"
              textAlign="center"
            >
              {session.joinStage === "syncing"
                ? "Found the room. Syncing the level..."
                : slowJoin
                  ? "Still looking. Some networks take a little longer."
                  : "Looking for the room..."}
            </Typography>
          </Stack>
          <Button color="inherit" onClick={onCancelJoin}>
            Cancel
          </Button>
        </Stack>
      ) : showCodeScreen ? (
        <Stack spacing={1.5} alignItems="center" sx={{ py: 1, width: "100%" }}>
          {session.signalingDown && (
            <Alert severity="warning" sx={{ alignSelf: "stretch" }}>
              Can't reach the connection servers right now, so nobody will be
              able to join. Check your internet connection or firewall.
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            Share this code with your collaborators:
          </Typography>
          <RoomCodeDisplay code={session.roomCode ?? ""} />
          <Typography variant="caption" color="text.secondary">
            Anyone with the code can join while someone is in the room.
          </Typography>
          <Button variant="contained" onClick={closeModal}>
            Done
          </Button>
        </Stack>
      ) : unsavedGuardOpen ? (
        <Stack spacing={2} sx={{ width: "100%" }}>
          <Typography variant="body2">
            Joining will replace your current level with the room's. Save it
            first?
          </Typography>
          {saveBeforeJoinFailed && (
            <Alert severity="error">
              Couldn't save the level. Local storage may be full. Free up a slot
              in the level manager, or join without saving.
            </Alert>
          )}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button color="inherit" onClick={() => setUnsavedGuardOpen(false)}>
              Cancel
            </Button>
            <Button
              color="inherit"
              onClick={() => {
                setUnsavedGuardOpen(false);
                startJoin();
              }}
            >
              Join without saving
            </Button>
            <Button variant="contained" onClick={onSaveAndJoin}>
              Save and join
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={2} sx={{ width: "100%" }}>
          <VersionWarning check={versionCheck} />
          <IdentityEditor identity={identity} onChange={updateIdentity} />
          <Tabs
            value={tab}
            onChange={(_, next) => setTab(next)}
            variant="fullWidth"
            sx={{ minHeight: 38, borderBottom: 1, borderColor: "divider" }}
          >
            <Tab
              label="Host a room"
              value="host"
              sx={{ minHeight: 38, textTransform: "none" }}
              data-testid="room-tab-host"
            />
            <Tab
              label="Join a room"
              value="join"
              sx={{ minHeight: 38, textTransform: "none" }}
              data-testid="room-tab-join"
            />
          </Tabs>
          {tab === "host" ? (
            <Stack spacing={1.5} sx={{ px: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {`Starts a room from your current level: ${levelName}`}
              </Typography>
              <Button
                variant="contained"
                disabled={!identityReady}
                onClick={onHost}
                data-testid="room-host"
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
                data-testid="room-join"
              >
                Join
              </Button>
            </Stack>
          )}
          {session.joinError && (
            <Alert severity="error">{session.joinError}</Alert>
          )}
        </Stack>
      )}
    </BaseModal>
  );
}

export const CollabRoomModalDefinition: ModalDefinitionType<"collabRoom"> = {
  modalName: "collabRoom",
  component: CollabRoomModal
};

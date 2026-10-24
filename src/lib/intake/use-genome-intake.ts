import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import * as experiences from "../../experiences/index.ts";
import { chooseGenomeFile, createIntakeRequests } from "./genome-intake.ts";
import { RESULTS_STEP } from "../navigation/journey.ts";
import { publicSampleSource, SAMPLE } from "../catalogues/public-sample.ts";
import type { OpenedGenome } from "../../experiences/types.ts";
import type { SupportedBuild } from "../genetics/reference-build.ts";
import { reportError } from "../error-reporting.ts";

interface PendingBuild {
  id: number;
  opened: OpenedGenome;
  name: string;
  request: AbortController;
}

export function useGenomeIntake(view?: "results") {
  const navigate = useNavigate();
  const [fetching, setFetching] = useState<number | null>(null); // while the public header opens
  const [loadError, setLoadError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [readProgress, setReadProgress] = useState<number>();
  const [drag, setDrag] = useState(false);
  const [pendingBuild, setPendingBuild] = useState<PendingBuild | null>(null);
  const pendingBuildId = useRef(0);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const requests = useRef(createIntakeRequests());
  const busy = preparing || fetching != null || pendingBuild != null;

  // Only client-side navigation keeps a selection. A fresh page has no file.
  useEffect(() => {
    const pending = requests.current;
    return () => pending.cancel();
  }, []);

  async function finishSelection(
    opened: OpenedGenome,
    name: string,
    kind: "upload" | "sample",
    request: AbortController,
  ) {
    if (!requests.current.isCurrent(request)) return;
    experiences.selectGenome(opened, name, kind);
    setPendingBuild(null);
    const build = experiences.getExperience().describe().build;
    await navigate({
      to: "/chapter/$n",
      params: {
        n:
          view === "results" && (build === "GRCh37" || build === "GRCh38")
            ? String(RESULTS_STEP + 1)
            : "1",
      },
    });
  }

  async function confirmBuild(build: SupportedBuild | null) {
    if (!pendingBuild || !requests.current.isCurrent(pendingBuild.request)) return;
    const { opened, name, request } = pendingBuild;
    try {
      await finishSelection(
        { ...opened, selectedBuild: build || undefined },
        name,
        "upload",
        request,
      );
    } catch (error) {
      if (requests.current.isCurrent(request)) {
        reportError(error, "build-choice");
        setLoadError((error as Error).message);
      }
    }
  }

  function cancelBuild() {
    requests.current.cancel();
    setPendingBuild(null);
    setPreparing(false);
    setFetching(null);
    setReadProgress(undefined);
    setLoadError("");
    setDrag(false);
  }

  async function openFile(files: FileList | null) {
    if (!files?.length) return;
    const request = requests.current.begin();
    setFetching(null);
    setPendingBuild(null);
    setPreparing(true);
    setReadProgress(undefined);
    setLoadError("");
    try {
      const file = chooseGenomeFile(files);
      const opened = await experiences.openGenomeFile(file, request.signal, (fraction) => {
        if (requests.current.isCurrent(request)) setReadProgress(fraction);
      });
      if (!requests.current.isCurrent(request)) return;
      if (opened.build === "unknown")
        setPendingBuild({ id: ++pendingBuildId.current, opened, name: file.name, request });
      else await finishSelection(opened, file.name, "upload", request);
    } catch (error) {
      if (requests.current.isCurrent(request)) {
        reportError(error, "file-open", "read-file");
        setLoadError(
          (error as Error).message || "This file could not be read. Try the public sample.",
        );
      }
    } finally {
      if (requests.current.isCurrent(request)) setPreparing(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    void openFile(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    void openFile(e.dataTransfer.files);
  }

  // Read just the public sample's header; later chapters request the ranges they use.
  async function loadSample() {
    if (fetching != null || preparing) return;
    const request = requests.current.begin();
    setPendingBuild(null);
    setFetching(0);
    setLoadError("");
    try {
      const opened = await experiences.openPublicSample(publicSampleSource(), request.signal);
      await finishSelection(opened, SAMPLE.name, "sample", request);
    } catch (error) {
      if (requests.current.isCurrent(request)) {
        reportError(error, "sample-open", "read-file");
        setLoadError(
          (error as Error).message ||
            "The public sample could not be loaded. Choose your own file.",
        );
      }
    } finally {
      if (requests.current.isCurrent(request)) {
        setFetching(null);
      }
    }
  }

  return {
    fetching,
    loadError,
    preparing,
    readProgress,
    drag,
    setDrag,
    fileInput,
    busy,
    onPick,
    onDrop,
    loadSample,
    pendingBuild,
    confirmBuild,
    cancelBuild,
  };
}

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Loader2,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  BookOpen,
  Layers,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import { CATEGORY_META, type Category } from "@/data/sample-documents";

interface Concept {
  id: string;
  name: string;
  slug: string;
  categories: string[];
  doc_count: number;
  doc_ids: string[];
}

interface Edge {
  id: string;
  source_id: string;
  target_id: string;
  relationship: string;
}

interface SimNode extends Concept {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  radius: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  Orbit: "#1d4ed8",
  "Eyelid-Eyebrow": "#7c3aed",
  "Skin Conditions": "#b45309",
  Face: "#be123c",
  Lacrimal: "#0e7490",
  Other: "#059669",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  treats: "treats",
  causes: "causes",
  diagnoses: "diagnoses",
  associated_with: "associated with",
  part_of: "part of",
  complication_of: "complication of",
  technique_for: "technique for",
};

function getNodeColor(categories: string[]): string {
  if (categories.length === 0) return "#6b7280";
  if (categories.length === 1)
    return CATEGORY_COLORS[categories[0]] || "#6b7280";
  return "#d97706"; // multi-category = amber
}

export default function MindMapPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [docMap, setDocMap] = useState<Record<string, { title: string; category: string }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const nodesRef = useRef<SimNode[]>([]);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{
    active: boolean;
    node: SimNode | null;
    isPan: boolean;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  }>({
    active: false,
    node: null,
    isPan: false,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
  });
  const transformRef = useRef(transform);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    fetch("/api/mindmap")
      .then((r) => r.json())
      .then((data) => {
        const dm: Record<string, { title: string; category: string }> =
          data.documents || {};
        setDocMap(dm);

        const enriched = (data.concepts || []).map(
          (c: Concept) => {
            const docCats = new Set<string>();
            for (const dId of c.doc_ids || []) {
              const info = dm[dId];
              if (info?.category) docCats.add(info.category);
            }
            return {
              ...c,
              categories: docCats.size > 0 ? Array.from(docCats) : c.categories,
            };
          }
        );

        setConcepts(enriched);
        setEdges(data.edges || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredConcepts = useMemo(() => {
    let list = concepts;
    if (selectedCategory !== "all") {
      list = list.filter((c) => c.categories.includes(selectedCategory));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list.slice(0, 300);
  }, [concepts, selectedCategory, search]);

  const filteredEdges = useMemo(() => {
    const ids = new Set(filteredConcepts.map((c) => c.id));
    return edges.filter((e) => ids.has(e.source_id) && ids.has(e.target_id));
  }, [filteredConcepts, edges]);

  const connectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return edges.filter(
      (e) =>
        e.source_id === selectedNode.id || e.target_id === selectedNode.id
    );
  }, [selectedNode, edges]);

  const connectedIds = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const ids = new Set<string>();
    for (const e of connectedEdges) {
      ids.add(e.source_id);
      ids.add(e.target_id);
    }
    ids.delete(selectedNode.id);
    return ids;
  }, [selectedNode, connectedEdges]);

  const initSimulation = useCallback(() => {
    const w = containerRef.current?.clientWidth || 800;
    const h = containerRef.current?.clientHeight || 600;

    const nodes: SimNode[] = filteredConcepts.map((c, i) => {
      const angle = (i / filteredConcepts.length) * Math.PI * 2;
      const r = Math.min(w, h) * 0.35;
      return {
        ...c,
        x: w / 2 + Math.cos(angle) * r * (0.5 + Math.random() * 0.5),
        y: h / 2 + Math.sin(angle) * r * (0.5 + Math.random() * 0.5),
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        radius: Math.max(4, Math.min(20, 3 + c.doc_count * 1.5)),
      };
    });

    nodesRef.current = nodes;
    setTransform({ x: 0, y: 0, k: 1 });
  }, [filteredConcepts]);

  useEffect(() => {
    if (filteredConcepts.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      initSimulation();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filteredConcepts, initSimulation]);

  useEffect(() => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;

    const nodeMap = new Map<string, SimNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const edgeList = filteredEdges
      .map((e) => ({
        source: nodeMap.get(e.source_id),
        target: nodeMap.get(e.target_id),
        ...e,
      }))
      .filter((e) => e.source && e.target);

    let alpha = 1;
    const alphaDecay = 0.0228;
    const alphaMin = 0.001;
    const w = containerRef.current?.clientWidth || 800;
    const h = containerRef.current?.clientHeight || 600;
    const cx = w / 2;
    const cy = h / 2;

    function tick() {
      if (alpha < alphaMin) {
        animRef.current = requestAnimationFrame(tick);
        draw();
        return;
      }
      alpha *= 1 - alphaDecay;

      for (const node of nodes) {
        if (node.fx !== null) {
          node.x = node.fx;
          node.y = node.fy!;
          continue;
        }

        // center gravity
        node.vx += (cx - node.x) * 0.005 * alpha;
        node.vy += (cy - node.y) * 0.005 * alpha;

        // repulsion
        for (const other of nodes) {
          if (node === other) continue;
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 200) {
            const force = (200 - dist) * 0.15 * alpha;
            node.vx += (dx / dist) * force;
            node.vy += (dy / dist) * force;
          }
        }

        // attraction (edges)
        for (const edge of edgeList) {
          if (edge.source === node || edge.target === node) {
            const other = edge.source === node ? edge.target! : edge.source!;
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const desired = 80 + node.radius + other.radius;
            const force = (dist - desired) * 0.01 * alpha;
            node.vx += (dx / dist) * force;
            node.vy += (dy / dist) * force;
          }
        }

        node.vx *= 0.6;
        node.vy *= 0.6;
        node.x += node.vx;
        node.y += node.vy;
      }

      draw();
      animRef.current = requestAnimationFrame(tick);
    }

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const t = transformRef.current;

      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      // edges
      for (const edge of edgeList) {
        const s = edge.source!;
        const tg = edge.target!;
        const isHighlighted =
          selectedNode &&
          (s.id === selectedNode.id || tg.id === selectedNode.id);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tg.x, tg.y);
        ctx.strokeStyle = isHighlighted
          ? "rgba(234, 88, 12, 0.5)"
          : "rgba(0, 0, 0, 0.06)";
        ctx.lineWidth = isHighlighted ? 2 : 0.5;
        ctx.stroke();
      }

      // nodes
      for (const node of nodes) {
        const isSelected = selectedNode?.id === node.id;
        const isConnected = connectedIds.has(node.id);
        const isHovered = hoveredNode?.id === node.id;
        const dimmed =
          selectedNode && !isSelected && !isConnected;
        const color = getNodeColor(node.categories);

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

        if (isSelected) {
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 15;
        } else if (isConnected) {
          ctx.fillStyle = color;
          ctx.shadowBlur = 0;
        } else if (dimmed) {
          ctx.fillStyle = color + "30";
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = color + "cc";
          ctx.shadowBlur = 0;
        }

        ctx.fill();
        ctx.shadowBlur = 0;

        if (isSelected || isHovered) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // label
        const showLabel =
          isSelected ||
          isConnected ||
          isHovered ||
          node.doc_count >= 5 ||
          t.k > 1.5 ||
          (!selectedNode && node.doc_count >= 3);

        if (showLabel && !dimmed) {
          ctx.font = `${isSelected ? "bold " : ""}${
            11 / Math.max(t.k, 0.8)
          }px "Instrument Sans", sans-serif`;
          ctx.fillStyle = isSelected
            ? "#1a1a2e"
            : isConnected
            ? "#1a1a2e"
            : "#444";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(
            node.name,
            node.x,
            node.y + node.radius + 4
          );
        }
      }

      ctx.restore();
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [
    filteredEdges,
    selectedNode,
    connectedIds,
    hoveredNode,
  ]);

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const t = transformRef.current;
      return {
        x: (sx - t.x) / t.k,
        y: (sy - t.y) / t.k,
      };
    },
    []
  );

  const findNodeAt = useCallback(
    (wx: number, wy: number) => {
      for (let i = nodesRef.current.length - 1; i >= 0; i--) {
        const n = nodesRef.current[i];
        const dx = wx - n.x;
        const dy = wy - n.y;
        if (dx * dx + dy * dy < (n.radius + 5) * (n.radius + 5)) return n;
      }
      return null;
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x: wx, y: wy } = screenToWorld(sx, sy);
      const node = findNodeAt(wx, wy);

      if (node) {
        dragRef.current = {
          active: true,
          node,
          isPan: false,
          startX: sx,
          startY: sy,
          startTx: 0,
          startTy: 0,
        };
        node.fx = node.x;
        node.fy = node.y;
      } else {
        dragRef.current = {
          active: true,
          node: null,
          isPan: true,
          startX: sx,
          startY: sy,
          startTx: transformRef.current.x,
          startTy: transformRef.current.y,
        };
      }
    },
    [screenToWorld, findNodeAt]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (dragRef.current.active) {
        if (dragRef.current.isPan) {
          const dx = sx - dragRef.current.startX;
          const dy = sy - dragRef.current.startY;
          setTransform((t) => ({
            ...t,
            x: dragRef.current.startTx + dx,
            y: dragRef.current.startTy + dy,
          }));
        } else if (dragRef.current.node) {
          const { x: wx, y: wy } = screenToWorld(sx, sy);
          dragRef.current.node.fx = wx;
          dragRef.current.node.fy = wy;
          dragRef.current.node.x = wx;
          dragRef.current.node.y = wy;
        }
      } else {
        const { x: wx, y: wy } = screenToWorld(sx, sy);
        const node = findNodeAt(wx, wy);
        setHoveredNode(node);
        if (canvasRef.current) {
          canvasRef.current.style.cursor = node ? "pointer" : "grab";
        }
      }
    },
    [screenToWorld, findNodeAt]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current.active && dragRef.current.node) {
        const moved =
          Math.abs(e.clientX - dragRef.current.startX - (canvasRef.current?.getBoundingClientRect().left || 0)) > 5;

        if (!moved || Math.abs(e.movementX) + Math.abs(e.movementY) < 5) {
          setSelectedNode((prev) =>
            prev?.id === dragRef.current.node?.id
              ? null
              : dragRef.current.node
          );
        }
        dragRef.current.node.fx = null;
        dragRef.current.node.fy = null;
      } else if (dragRef.current.isPan) {
        const dx = Math.abs(
          (e.clientX - (canvasRef.current?.getBoundingClientRect().left || 0)) -
            dragRef.current.startX
        );
        const dy = Math.abs(
          (e.clientY - (canvasRef.current?.getBoundingClientRect().top || 0)) -
            dragRef.current.startY
        );
        if (dx < 3 && dy < 3) setSelectedNode(null);
      }
      dragRef.current = {
        active: false,
        node: null,
        isPan: false,
        startX: 0,
        startY: 0,
        startTx: 0,
        startTy: 0,
      };
    },
    []
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;

    setTransform((t) => {
      const nk = Math.max(0.2, Math.min(5, t.k * factor));
      return {
        k: nk,
        x: mx - ((mx - t.x) / t.k) * nk,
        y: my - ((my - t.y) / t.k) * nk,
      };
    });
  }, []);

  const zoomTo = (factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = rect.width / 2;
    const my = rect.height / 2;
    setTransform((t) => {
      const nk = Math.max(0.2, Math.min(5, t.k * factor));
      return {
        k: nk,
        x: mx - ((mx - t.x) / t.k) * nk,
        y: my - ((my - t.y) / t.k) * nk,
      };
    });
  };

  const fitAll = () => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }

    const gw = maxX - minX || 1;
    const gh = maxY - minY || 1;
    const k = Math.min(
      (rect.width - 80) / gw,
      (rect.height - 80) / gh,
      3
    );
    setTransform({
      k,
      x: (rect.width - gw * k) / 2 - minX * k,
      y: (rect.height - gh * k) / 2 - minY * k,
    });
  };

  const categories = useMemo(() => {
    const known = ["Orbit", "Eyelid-Eyebrow", "Skin Conditions", "Face", "Lacrimal", "Other"];
    const present = new Set<string>();
    for (const c of concepts) {
      for (const cat of c.categories) {
        if (known.includes(cat)) present.add(cat);
      }
    }
    return known.filter((k) => present.has(k));
  }, [concepts]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
        <span className="ml-3 text-warm-gray">
          Loading concept map...
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col md:h-dvh">
      {/* Header */}
      <header className="border-b border-ivory-dark bg-white px-4 py-3 md:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-[DM_Serif_Display] text-xl text-navy md:text-2xl">
              Concept Mind Map
            </h1>
            <p className="text-xs text-warm-gray">
              {filteredConcepts.length} concepts &middot;{" "}
              {filteredEdges.length} connections
              {selectedCategory !== "all" && ` in ${selectedCategory}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search concepts..."
                className="w-32 rounded-lg border border-ivory-dark bg-ivory/50 py-2 pl-9 pr-3 text-xs text-navy placeholder:text-warm-gray-light focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral/20 md:w-56"
              />
            </div>
          </div>
        </div>

        {/* Category filters */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
              selectedCategory === "all"
                ? "bg-navy text-white"
                : "bg-ivory text-warm-gray hover:bg-ivory-dark"
            }`}
          >
            All
          </button>
          {categories.map((cat) => {
            const meta =
              CATEGORY_META[cat as Category] || CATEGORY_META["Other"];
            return (
              <button
                key={cat}
                onClick={() =>
                  setSelectedCategory(
                    selectedCategory === cat ? "all" : cat
                  )
                }
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                  selectedCategory === cat
                    ? `${meta.bg} ${meta.color}`
                    : "bg-ivory text-warm-gray hover:bg-ivory-dark"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </header>

      {/* Canvas + sidebar */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 bg-ivory-dark/30"
        >
          {filteredConcepts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <BookOpen size={40} className="text-warm-gray" />
              <p className="mt-3 text-sm text-warm-gray">
                {concepts.length === 0
                  ? "Concept map is being generated..."
                  : "No concepts match your filters"}
              </p>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="h-full w-full touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
            />
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1 rounded-lg border border-ivory-dark bg-white shadow-sm">
            <button
              onClick={() => zoomTo(1.3)}
              className="rounded-t-lg p-2 text-warm-gray hover:bg-ivory hover:text-navy transition-colors"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => zoomTo(0.7)}
              className="p-2 text-warm-gray hover:bg-ivory hover:text-navy transition-colors"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={fitAll}
              className="rounded-b-lg p-2 text-warm-gray hover:bg-ivory hover:text-navy transition-colors"
            >
              <Maximize2 size={16} />
            </button>
          </div>

          {/* Legend */}
          <div className="absolute left-4 bottom-4 hidden rounded-lg border border-ivory-dark bg-white/95 p-3 shadow-sm md:block">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-warm-gray">
              Categories
            </p>
            <div className="space-y-1">
              {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                <div key={cat} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[11px] text-navy/70">{cat}</span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="text-[11px] text-navy/70">
                  Multi-category
                </span>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-warm-gray">
              Node size = # documents
            </p>
          </div>
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <div className="fixed inset-0 z-40 bg-white overflow-auto animate-scale-in md:static md:inset-auto md:z-auto md:w-80 md:border-l md:border-ivory-dark md:shadow-lg md:animate-none">
            <div className="sticky top-0 border-b border-ivory-dark bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <h2 className="font-[DM_Serif_Display] text-lg text-navy">
                  {selectedNode.name}
                </h2>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="rounded p-1 text-warm-gray hover:bg-ivory hover:text-navy"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedNode.categories.map((cat) => {
                  const meta =
                    CATEGORY_META[cat as Category] ||
                    CATEGORY_META["Other"];
                  return (
                    <span
                      key={cat}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.color}`}
                    >
                      {cat}
                    </span>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-warm-gray">
                Appears in {selectedNode.doc_count} document
                {selectedNode.doc_count !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Connections */}
            {connectedEdges.length > 0 && (
              <div className="border-b border-ivory-dark px-4 py-3">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-warm-gray">
                  Connections ({connectedEdges.length})
                </h3>
                <div className="space-y-1.5 max-h-60 overflow-auto">
                  {connectedEdges.map((edge) => {
                    const isSource =
                      edge.source_id === selectedNode.id;
                    const otherId = isSource
                      ? edge.target_id
                      : edge.source_id;
                    const other = concepts.find(
                      (c) => c.id === otherId
                    );
                    if (!other) return null;
                    return (
                      <button
                        key={edge.id}
                        onClick={() => {
                          const node = nodesRef.current.find(
                            (n) => n.id === otherId
                          );
                          if (node) setSelectedNode(node);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-all hover:bg-ivory"
                      >
                        <ArrowRight
                          size={12}
                          className={
                            isSource
                              ? "text-coral"
                              : "rotate-180 text-sage-dark"
                          }
                        />
                        <span className="text-warm-gray">
                          {RELATIONSHIP_LABELS[edge.relationship] ||
                            edge.relationship}
                        </span>
                        <span className="font-medium text-navy">
                          {other.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Documents */}
            <div className="px-4 py-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-warm-gray">
                Related Documents ({selectedNode.doc_ids.length})
              </h3>
              <div className="space-y-1.5 max-h-80 overflow-auto">
                {selectedNode.doc_ids
                  .slice(0, 20)
                  .map((docId) => {
                    const info = docMap[docId];
                    return (
                      <div
                        key={docId}
                        className="rounded-lg border border-ivory-dark px-3 py-2"
                      >
                        <Link
                          href={`/read/${docId}`}
                          className="text-xs font-medium text-navy hover:text-coral line-clamp-2 block"
                        >
                          {info?.title || "Document"}
                        </Link>
                        {info?.category && (
                          <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                            (CATEGORY_META[info.category as Category] || CATEGORY_META["Other"]).bg
                          } ${
                            (CATEGORY_META[info.category as Category] || CATEGORY_META["Other"]).color
                          }`}>
                            {info.category}
                          </span>
                        )}
                        <div className="mt-1.5 flex gap-1">
                          <Link
                            href={`/read/${docId}`}
                            className="rounded bg-ivory px-1.5 py-0.5 text-[10px] font-medium text-navy hover:bg-ivory-dark"
                          >
                            <BookOpen size={10} className="inline mr-0.5" /> Read
                          </Link>
                          <Link
                            href={`/flashcards/${docId}`}
                            className="rounded bg-coral/10 px-1.5 py-0.5 text-[10px] font-medium text-coral hover:bg-coral/20"
                          >
                            <Layers size={10} className="inline mr-0.5" /> Cards
                          </Link>
                          <Link
                            href={`/quiz/${docId}`}
                            className="rounded bg-navy/5 px-1.5 py-0.5 text-[10px] font-medium text-navy hover:bg-navy/10"
                          >
                            <ClipboardList size={10} className="inline mr-0.5" /> Quiz
                          </Link>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

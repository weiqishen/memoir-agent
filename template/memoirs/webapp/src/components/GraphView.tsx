import { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import ForceGraph2D from 'react-force-graph-2d';
import type { APIPayload, GraphNode, SelectedItem, Theme } from '../types';
import { GRAPH_COLORS } from '../constants/theme';
import type { Translations } from '../i18n';

interface Props {
  graph: APIPayload['graph'];
  theme: Theme;
  onNodeClick: (item: SelectedItem) => void;
  t: Translations;
}

/** Knowledge graph — events connected to people and places. */
export function GraphView({ graph, theme, onNodeClick, t }: Props) {
  const graphRef = useRef<any>(null);
  const colors = GRAPH_COLORS[theme];

  const nodeColor = (node: any) => {
    switch (node.group) {
      case 2: return colors.event;
      case 3: return colors.place;
      case 4: return colors.person;
      default: return colors.event;
    }
  };

  const handleNodeClick = useCallback((node: any) => {
    if (node.group === 2 && node.entry) {
      onNodeClick({ type: 'event', period: node.period, entry: node.entry });
    } else {
      onNodeClick({ type: 'tag', tagNode: node as GraphNode });
    }
  }, [onNodeClick]);

  return (
    <motion.main
      className="graph-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ForceGraph2D
        ref={graphRef}
        width={680}
        height={600}
        graphData={graph}
        nodeLabel="name"
        nodeColor={nodeColor}
        nodeRelSize={6}
        linkColor={() => colors.link}
        backgroundColor={colors.bg}
        onNodeClick={handleNodeClick}
      />
      <div className="graph-legend">
        <span className="legend-dot" style={{ backgroundColor: colors.event  }} /> {t.memories}
        <span className="legend-dot" style={{ backgroundColor: colors.place  }} /> {t.tabLocation}
        <span className="legend-dot" style={{ backgroundColor: colors.person }} /> {t.tabPeople}
      </div>
    </motion.main>
  );
}

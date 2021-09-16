import uPlot, { Cursor, Band, Hooks, Select, AlignedData } from 'uplot';
import { merge } from 'lodash';
import {
  DataFrame,
  DefaultTimeZone,
  EventBus,
  getTimeZoneInfo,
  GrafanaTheme2,
  TimeRange,
  TimeZone,
} from '@grafana/data';
import { PlotConfig, PlotTooltipInterpolator } from '../types';
import { ScaleProps, UPlotScaleBuilder } from './UPlotScaleBuilder';
import { SeriesProps, UPlotSeriesBuilder } from './UPlotSeriesBuilder';
import { AxisProps, UPlotAxisBuilder } from './UPlotAxisBuilder';
import { AxisPlacement } from '../config';
import { pluginLog } from '../utils';
import { getThresholdsDrawHook, UPlotThresholdOptions } from './UPlotThresholds';

const cursorDefaults: Cursor = {
  // prevent client-side zoom from triggering at the end of a selection
  drag: { setScale: false },
  points: {
    /*@ts-ignore*/
    size: (u, seriesIdx) => u.series[seriesIdx].points.size * 2,
    /*@ts-ignore*/
    width: (u, seriesIdx, size) => size / 4,
  },
  focus: {
    prox: 30,
  },
};

type PrepData = (frame: DataFrame) => AlignedData;

export class UPlotConfigBuilder {
  private series: UPlotSeriesBuilder[] = [];
  private axes: Record<string, UPlotAxisBuilder> = {};
  private scales: UPlotScaleBuilder[] = [];
  private bands: Band[] = [];
  private cursor: Cursor | undefined;
  private isStacking = false;
  private select: uPlot.Select | undefined;
  private hasLeftAxis = false;
  private hasBottomAxis = false;
  private hooks: Hooks.Arrays = {};
  private tz: string | undefined = undefined;
  private sync = false;
  private frame: DataFrame | undefined = undefined;
  // to prevent more than one threshold per scale
  private thresholds: Record<string, UPlotThresholdOptions> = {};
  // Custom handler for closest datapoint and series lookup
  private tooltipInterpolator: PlotTooltipInterpolator | undefined = undefined;

  prepData: PrepData | undefined = undefined;

  constructor(timeZone: TimeZone = DefaultTimeZone) {
    this.tz = getTimeZoneInfo(timeZone, Date.now())?.ianaName;
  }

  // Exposed to let the container know the primary scale keys
  scaleKeys: [string, string] = ['', ''];

  addHook<T extends keyof Hooks.Defs>(type: T, hook: Hooks.Defs[T]) {
    pluginLog('UPlotConfigBuilder', false, 'addHook', type);

    if (!this.hooks[type]) {
      this.hooks[type] = [];
    }

    this.hooks[type]!.push(hook as any);
  }

  addThresholds(options: UPlotThresholdOptions) {
    if (!this.thresholds[options.scaleKey]) {
      this.thresholds[options.scaleKey] = options;
      this.addHook('drawClear', getThresholdsDrawHook(options));
    }
  }

  addAxis(props: AxisProps) {
    props.placement = props.placement ?? AxisPlacement.Auto;

    if (this.axes[props.scaleKey]) {
      this.axes[props.scaleKey].merge(props);
      return;
    }

    // Handle auto placement logic
    if (props.placement === AxisPlacement.Auto) {
      props.placement = this.hasLeftAxis ? AxisPlacement.Right : AxisPlacement.Left;
    }

    switch (props.placement) {
      case AxisPlacement.Left:
        this.hasLeftAxis = true;
        break;
      case AxisPlacement.Bottom:
        this.hasBottomAxis = true;
        break;
    }

    if (props.placement === AxisPlacement.Hidden) {
      props.show = false;
      props.size = 0;
    }

    this.axes[props.scaleKey] = new UPlotAxisBuilder(props);
  }

  getAxisPlacement(scaleKey: string): AxisPlacement {
    const axis = this.axes[scaleKey];
    return axis?.props.placement! ?? AxisPlacement.Left;
  }

  setCursor(cursor?: Cursor) {
    this.cursor = merge({}, this.cursor, cursor);
  }

  setSelect(select: Select) {
    this.select = select;
  }

  setStacking(enabled = true) {
    this.isStacking = enabled;
  }

  addSeries(props: SeriesProps) {
    this.series.push(new UPlotSeriesBuilder(props));
  }

  getSeries() {
    return this.series;
  }

  /** Add or update the scale with the scale key */
  addScale(props: ScaleProps) {
    const current = this.scales.find((v) => v.props.scaleKey === props.scaleKey);
    if (current) {
      current.merge(props);
      return;
    }
    this.scales.push(new UPlotScaleBuilder(props));
  }

  addBand(band: Band) {
    this.bands.push(band);
  }

  setTooltipInterpolator(interpolator: PlotTooltipInterpolator) {
    this.tooltipInterpolator = interpolator;
  }

  getTooltipInterpolator() {
    return this.tooltipInterpolator;
  }

  setPrepData(prepData: PrepData) {
    this.prepData = (frame) => {
      this.frame = frame;
      return prepData(frame);
    };
  }

  setSync() {
    this.sync = true;
  }

  hasSync() {
    return this.sync;
  }

  getConfig() {
    const config: PlotConfig = {
      series: [
        {
          value: () => '',
        },
      ],
    };
    config.axes = this.ensureNonOverlappingAxes(Object.values(this.axes)).map((a) => a.getConfig());
    config.series = [...config.series, ...this.series.map((s) => s.getConfig())];
    config.scales = this.scales.reduce((acc, s) => {
      return { ...acc, ...s.getConfig() };
    }, {});

    config.hooks = this.hooks;

    config.select = this.select;

    const pointColorFn = (alphaHex = '') => (u: uPlot, seriesIdx: number) => {
      /*@ts-ignore*/
      let s = u.series[seriesIdx].points._stroke;

      // interpolate for gradients/thresholds
      if (typeof s !== 'string') {
        let field = this.frame!.fields[seriesIdx];
        s = field.display!(field.values.get(u.cursor.idxs![seriesIdx]!)).color!;
      }

      return s + alphaHex;
    };

    config.cursor = merge({}, cursorDefaults, this.cursor, {
      points: {
        stroke: pointColorFn('80'),
        fill: pointColorFn(),
      },
    });

    config.tzDate = this.tzDate;

    if (this.isStacking) {
      // Let uPlot handle bands and fills
      config.bands = this.bands;
    } else {
      // When fillBelowTo option enabled, handle series bands fill manually
      if (this.bands?.length) {
        config.bands = this.bands;
        const keepFill = new Set<number>();
        for (const b of config.bands) {
          keepFill.add(b.series[0]);
        }

        for (let i = 1; i < config.series.length; i++) {
          if (!keepFill.has(i)) {
            config.series[i].fill = undefined;
          }
        }
      }
    }

    return config;
  }

  private ensureNonOverlappingAxes(axes: UPlotAxisBuilder[]): UPlotAxisBuilder[] {
    for (const axis of axes) {
      if (axis.props.placement === AxisPlacement.Right && this.hasLeftAxis) {
        axis.props.grid = false;
      }
      if (axis.props.placement === AxisPlacement.Top && this.hasBottomAxis) {
        axis.props.grid = false;
      }
    }

    return axes;
  }

  private tzDate = (ts: number) => {
    let date = new Date(ts);

    return this.tz ? uPlot.tzDate(date, this.tz) : date;
  };
}

/** @alpha */
type UPlotConfigPrepOpts<T extends Record<string, any> = {}> = {
  frame: DataFrame;
  theme: GrafanaTheme2;
  timeZone: TimeZone;
  getTimeRange: () => TimeRange;
  eventBus: EventBus;
  allFrames: DataFrame[];
} & T;

/** @alpha */
export type UPlotConfigPrepFn<T extends {} = {}> = (opts: UPlotConfigPrepOpts<T>) => UPlotConfigBuilder;

import { Component, ViewChild, ElementRef, NgZone, OnInit, AfterViewInit, EventEmitter } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, fromEvent } from 'rxjs';
import { map, debounceTime } from 'rxjs/operators';

import { AmApiService } from '../../services/am-api.service';
import { IAggregation, IQuery } from '../../services/agens-event-types';
import { DATE_UTILS } from '../../services/agens-util-funcs';
import { PALETTE_DARK, PALETTE_BRIGHT } from '../../utils/palette-colors';

import * as _ from 'lodash';

import { IGraph, EMPTY_GRAPH, IElement, IUserEvent, ILabels, ILabel, CREATED_TAG } from '../../services/agens-graph-types';
import { CY_STYLES } from '../../services/agens-cyto-styles';

import * as am4core from "@amcharts/amcharts4/core";
import * as am4charts from "@amcharts/amcharts4/charts";
import am4themes_animated from "@amcharts/amcharts4/themes/animated";

am4core.useTheme(am4themes_animated);

declare const cytoscape:any;
declare const tippy:any;
declare const jQuery:any;

const CY_CONFIG:any ={
  layout: { name: "euler"
    , fit: true, padding: 50, randomize: true, animate: false, positions: undefined
    , zoom: undefined, pan: undefined, ready: undefined, stop: undefined
  },
  // initial viewport state:
  zoom: 1,
  minZoom: 1e-1,
  maxZoom: 1e1,
  wheelSensitivity: 0.2,
  boxSelectionEnabled: true,
  motionBlur: true,
  selectionType: "single",
  // autoungrabify: true        // cannot move node by user control
};

@Component({
  selector: 'app-monitor-view',
  templateUrl: './monitor-view.component.html',
  styleUrls: ['./monitor-view.component.scss']
})
export class MonitorViewComponent implements OnInit, AfterViewInit {

  qid:number;
  aggregations:IAggregation[] = [];
  query:any = {   // IQueryWithDateRange
    id: null, name: 'unknown',
    datasource: 'unknown', query: null, slicedQry: null,
    from_date: null, to_date: null, cnt: 0
  };

  chartData = {
    data: [],
    from: null,
    to: null
  };
  scrollEmitter = new EventEmitter<any>();
  start_dt:Date;
  end_dt:Date;

  private chart: am4charts.XYChart;

  private g:IGraph = _.cloneDeep(EMPTY_GRAPH);
  cy: any = undefined;                  // cytoscape.js
  readyEmitter = new EventEmitter<boolean>();
  tippyHandlers:any[] = [];

  private cyPrevEvent:IUserEvent = { type: undefined, data: undefined };  // 중복 idle 이벤트 제거용

  // for doubleTap
  tappedBefore:any;
  tappedTimeout:any;
  tappedTarget:any;
  tappedCount:number = 0;

  heading = 'History Monitor';
  subheading = 'This is an history monitor for aggregating daily events of query.';
  icon = 'pe-7s-plane icon-gradient bg-tempting-azure';

  @ViewChild("cy", {read: ElementRef, static: false}) divCy: ElementRef;
  // @Output() actionEmitter= new EventEmitter<IUserEvent>();

  constructor(
    private amApiService: AmApiService,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(){
    let qid:Observable<string> = this.route.queryParamMap.pipe(map(params => params.get('qid')));
    qid.subscribe(q=>{
      if( !q ){   // is null
        this.router.navigate(['']);
        return;
      }
      this.qid = Number.parseInt(q);

      this.amApiService.findQueryWithDateRange(this.qid).subscribe(r=>{
        if( !!r ){
          this.query = r;
          if( this.query.script ){
            this.query['slicedQry'] = this.query.script.substr(0,100);
            // load graph-data
            if( this.query.cnt != null && this.query.cnt > 0 )
            this.loadEventsWithDateRange(this.query.datasource, this.query.id, this.query.from_date, this.query.to_date);
          }
        }
      });
    });
  }

  ngAfterViewInit() {
    this.doInitChart(this.qid);
    // this.initGraph(this.g);     // empty graph

    // graph data ready
    this.readyEmitter.subscribe(r=>{
      if( r ){
        this.initGraph(this.g);     // empty graph
        // this.loadGraphData(this.g);
      }
    });
    this.scrollEmitter.subscribe(r=>{
      // for DEBUG
      if( localStorage.getItem('debug')=='true' ) console.log("dragstop:", r.target, DATE_UTILS.toYYYYMMDD(new Date(r.value)));

      if( r.target == 'start' ) this.start_dt = new Date(r.value);
      else this.end_dt = new Date(r.value);
      // change visibility of cy elements by date terms
      if( this.cy ) this.showGraphByDateTerms(this.cy, this.start_dt, this.end_dt);
    });
  }

  ngOnDestroy() {
    this.doDestoryChart();

    // https://atomiks.github.io/tippyjs/methods/#destroy
    if( this.cy ){
      this.cy.nodes().forEach(e=>{
        if( e.scratch('_tippy') ) e.scratch('_tippy').destroy();
      });
      if( !this.cy.destroyed() ) this.cy.destroy();
    }

    this.cy = window['cy'] = undefined;
    this.g = _.cloneDeep(EMPTY_GRAPH);
  }

  doInitChart(qid:number){
    if( qid == null ) return;
    let aggregations$ = this.amApiService.findAggregationsByQid(qid);

    aggregations$.pipe(map(q=><IAggregation[]>q)).subscribe(rows => {
      this.aggregations = _.sortBy(rows, ['edate']);
      // console.log('aggregations =>', this.aggregations);
      this.chartData = this.makeChartData(this.aggregations);
      this.start_dt = this.chartData['startDate'];
      this.end_dt = this.chartData['endDate'];

      this.zone.runOutsideAngular(() =>{
        this.chart = this.initChart(this.chartData);
      });
    });
  }

  doDestoryChart(){
    this.zone.runOutsideAngular(() => {
      if (this.chart) this.chart.dispose();
    });
  }

  doRefresh($event){
    if( $event ){
      this.doDestoryChart();
      this.doInitChart(this.qid);
    }
  }

  btnCanvasFit(){
    if( this.cy ) this.cy.fit( this.cy.elements(), 50);
  }

  /////////////////////////////////////////////////////////////////////////

  makeChartData(sorted: IAggregation[]): any {
    let chartData : any = {};
    if( _.isNull(sorted) || sorted.length == 0 ) return chartData;

    // get min and max date
    //  - order by edate, qid
    chartData['from'] = sorted[0].edate;
    chartData['to'] = sorted[sorted.length-1].edate;
    chartData['data'] = [];

    // make any array
    //  - loop : min date ~ max date
    let fromDate = new Date(chartData['from'])
    fromDate.setDate( fromDate.getDate() - 1 );         // before one more day
    chartData['startDate'] = fromDate;                  // save first day

    let dayCount = DATE_UTILS.diffDays(fromDate, new Date(chartData['to']))+1;
    let curr;
    for( let idx=0; idx <= dayCount; idx+=1 ){          // until one more day
      curr = DATE_UTILS.afterDays(fromDate, idx);
      let currString = DATE_UTILS.toYYYYMMDD(curr);
      let row:any = { date: curr, value: 0 };

      let matched = _.find(sorted, r=>r.edate == currString );
      if( matched != undefined ){
        row['value'] = matched.ids_cnt;
      }
      chartData['data'].push(row);
    }
    chartData['endDate'] = curr;                        // save last day

    // console.log('chartData:', chartData);
    return chartData;
  }

  initChart(chartData: any):am4charts.XYChart {
    let chart = am4core.create("chartdiv", am4charts.XYChart);
    chart.paddingRight = 20;
    chart.data = chartData.data;

    let dateAxis = chart.xAxes.push(new am4charts.DateAxis());
    dateAxis.renderer.grid.template.location = 0;
    dateAxis.dateFormats.setKey("day", "yyyy-MM-dd");
    dateAxis.baseInterval = { timeUnit: 'day', count: 1 };    // time unit: second, minute, hour, day, etc.
                                               // https://www.amcharts.com/docs/v4/concepts/axes/date-axis/
    // Handling axis zoom events via API
    // https://www.amcharts.com/docs/v4/tutorials/handling-axis-zoom-events-via-api/
    fromEvent(dateAxis.events, "startchanged").pipe(
      // filter(ev=>ev['target'].hasOwnProperty('minZoomed') && ev['target']['minZoomed'] != null),
      debounceTime(300)
    ).subscribe(ev=>{
      this.scrollEmitter.emit({target:'start', value:new Date(ev['target']['minZoomed'])});
    });
    fromEvent(dateAxis.events, "endchanged").pipe(
      // filter(ev=>ev['target'].hasOwnProperty('maxZoomed') && ev['target']['maxZoomed'] != null),
      debounceTime(300)
    ).subscribe(ev=>{
      this.scrollEmitter.emit({target:'end', value:new Date(ev['target']['maxZoomed'])});
    });

    let valueAxis = chart.yAxes.push(new am4charts.ValueAxis());
    valueAxis.tooltip.disabled = true;
    valueAxis.renderer.minWidth = 35;

    let series = chart.series.push(new am4charts.LineSeries());
    series.dataFields.dateX = "date";
    series.dataFields.valueY = "value";

    series.tooltipText = "{valueY.value}";
    chart.cursor = new am4charts.XYCursor();

    let scrollbarX = new am4charts.XYChartScrollbar();
    scrollbarX.series.push(series);
    chart.scrollbarX = scrollbarX;

    return chart;
  }

  /////////////////////////////////////////////////////////////////////////

  /////////////////////////////////////////////////////////////////////////

  /* //
  1) 기간 from ~ to 구하고
  2) event_rows 로부터 조건1(qid), 조건2(from ~ to) 조회
      => ids list (중복제거)
      ** NOTE: alert 서버에서 필요한 데이터를 모두 제공하도록 기술
  3) agenspop 에 질의
      - Lv1 : monitoring target elements
      - Lv2 : connected edges (if targets are nodes) or vertices (if targets are edges)
      - Lv3 : if any target is not edge, retrieve neighbors of targets and connected edges
  4) Styling
      - targets : opacity  = 1, labeling by id
      - others : opacity = 0.3, no labeling
  5) Action
      - On click, show properties of itself
  */ //

  private getLabels(arr:IElement[]):ILabel[] {
    let grp = _.groupBy(arr, 'data.label');     // { labelName: [eles ...], ... }
    let keys = Object.keys(grp);
    let labels:ILabel[] = [];
    for( let i=0; i<keys.length; i+=1 ){
      let eles = grp[keys[i]];
      labels.push( <ILabel>{ idx: i, name: keys[i], size: eles.length, elements: eles } );
      eles.forEach(e=>e.scratch['_label'] = <ILabel>labels[i]);
    }
    return labels;
  }

  loadEventsWithDateRange( datasource:string, qid:number, from_date: string, to_date: string ){
    let eles$:Observable<IElement[]> = this.amApiService.findEventsWithDateRange(qid, from_date, to_date);
    eles$.subscribe(r=>{
        this.g.datasource = datasource;

        // console.log("** gremlin =>", r);
        let nodes = r.filter(e=>e.group == 'nodes').map(e=>{ e.scratch['_etype']='target'; return e; });
        let edges = r.filter(e=>e.group == 'edges').map(e=>{ e.scratch['_etype']='target'; return e; });

        // targets : nodes <= neighbor_nodes <= connected_edges
        if( nodes.length > 0 && edges.length == 0 ){
          // get connected edges of vertices
          let vids = nodes.map(e=>e.data.id);

          this.amApiService.findNeighborVertices(this.g.datasource, vids).pipe(
            map(e=>{ e.forEach(x=>x.scratch['_etype']='neighbor'); return e; })
          ).subscribe(x=>{
            let neighbors = x.filter(e=>e.group == 'nodes');
            this.g.nodes = nodes.concat(neighbors)

            let vids_with_neighbors = vids.concat( neighbors.map(e=>e.data.id) );
            this.amApiService.findConnectedEdges(this.g.datasource, vids_with_neighbors).pipe(
              map(e=>{ e.forEach(x=>x.scratch['_etype']='neighbor'); return e; })
            ).subscribe(y=>{
              this.g.edges = y.filter(e=>e.group == 'edges');
              this.g.labels.edges = this.getLabels(this.g.edges);
              this.g.labels.nodes = this.getLabels(this.g.nodes);
              // create graph
              this.readyEmitter.emit(true);
            });
          });
        }

        // targets : edges <= connected_nodes <= connected_edges
        else if( nodes.length == 0 && edges.length > 0 ){
          // get connected vertices of edges
          let eids = edges.map(e=>e.data.id);
          this.amApiService.findConnectedVertices(this.g.datasource, eids).pipe(
              map(e=>{ e.forEach(x=>x.scratch['_etype']='neighbor'); return e; })
            ).subscribe(x=>{
              this.g.nodes = x.filter(e=>e.group == 'nodes');
              let vids = this.g.nodes.map(e=>e.data.id);

              this.amApiService.findConnectedEdges(this.g.datasource, vids).pipe(
                map(e=>{ e.forEach(x=>x.scratch['_etype']='neighbor'); return e; })
              ).subscribe(y=>{
                let connected_edges = y.filter(e=>e.group == 'edges' && !eids.includes(e.data.id));
                this.g.edges = edges.concat( connected_edges );
                this.g.labels.edges = this.getLabels(this.g.edges);
                this.g.labels.nodes = this.getLabels(this.g.nodes);
                // create graph
                this.readyEmitter.emit(true);
              });
            });
        }
      });
  }

  /////////////////////////////////////////////////////////////////////////

  private setColors(labels:ILabels){
    for( let x of labels.nodes ){
      x['color'] = PALETTE_DARK[x['idx']%PALETTE_DARK.length];      // DARK colors
      x['elements'].forEach(e=>{
        e.scratch['_color'] = x['color'];             // string
      });
    }
    for( let x of labels.edges ){
      x['color'] = PALETTE_BRIGHT[x['idx']%PALETTE_BRIGHT.length];  // no meaning!!
      x['elements'].forEach(e=>{
        e.scratch['_color'] = [                       // string[]
          (e.scratch._source).scratch._label.color,   // source node
          (e.scratch._target).scratch._label.color,   // target node
        ];
      });
    }
  }
  private connectedEdges(edges:IElement[], vids:Map<string,IElement>):IElement[] {
    let connected:IElement[] = [];
    for( let e of edges ){
      if( vids.has(e.data.source) && vids.has(e.data.target) ){
        e.scratch._source = vids.get(e.data.source);
        e.scratch._target = vids.get(e.data.target);
        connected.push( e );
      }
    }
    return connected;
  }

  private setStyleNode(e:any){
    if( e.scratch('_color') ){
      e.style('background-color', e.scratch('_color'));
    }
    if( e.scratch('_etype') == 'target' ){
      e.style('opacity',1.0); e.style('label',e.id());
      e.style('font-size',6); e.style('text-opacity',0.6);
    }
    else e.style('opacity',0.1);
  }
  private setStyleEdge(e:any){
    if( e.scratch('_color') && e.scratch('_color').length == 2 ){
      e.style('target-arrow-color', e.scratch('_color')[1]);
      e.style('line-gradient-stop-colors', e.scratch('_color'));
    }
    if( e.scratch('_etype') == 'target' ){
      e.style('opacity',1.0); e.style('label',e.id());
      e.style('font-size',6); e.style('text-opacity',0.6); e.style('text-rotation','autorotate'); e.style('text-margin-y','10px');
    }
    else e.style('opacity',0.1);
  }

  private showGraphByDateTerms(cy:any, start_dt:Date, end_dt:Date){
    let startDate = DATE_UTILS.toYYYYMMDD(start_dt)+' 00:00:00';
    let endDate = DATE_UTILS.toYYYYMMDD(end_dt)+' 00:00:00';
    let targets = cy.elements()
                    .filter(e=>e.scratch('_etype')=='target' && !!e.scratch(CREATED_TAG))
                    .filter(e=>e.scratch(CREATED_TAG) >= startDate && e.scratch(CREATED_TAG) <= endDate);

    // if targets are nodes, include neighbors to visible set
    let neighbors = targets.filter(e=>e.isNode()).neighborhood().filter(e=>e.scratch('_etype')!='target');
    // if targets are edges, include connected nodes to visible set
    let connected_nodes = targets.filter(e=>e.isEdge()).connectedNodes().filter(e=>e.scratch('_etype')!='target');
    // set visible nodes
    let visible_nodes = targets.union(neighbors).union(connected_nodes);
    // get connected edges
    let connected_edges = visible_nodes.edgesWith(visible_nodes).filter(e=>e.scratch('_etype')!='target');

    let visible_eles = visible_nodes.union(connected_edges);
    let invisible_eles = cy.elements().difference(visible_eles);    // rest elements

    // for DEBUG
    if( localStorage.getItem('debug')=='true' ) console.log(`showGraph[ ${DATE_UTILS.toYYYYMMDD(start_dt)} ~ ${DATE_UTILS.toYYYYMMDD(end_dt)} ]:`, visible_eles.map(e=>e.id()), invisible_eles.map(e=>e.id()));

    // **NOTE: hidden 에서 visible 로 잘 바뀌지 않는다. (nodes 가 target인 경우만 그런듯)
    //         edge 한두개가 보이지 않는데, 클릭해 보면 나온다. 당장은 해결책이 없음 (-_-;)
    cy.batch(()=>{
      visible_eles.style('display','element');
      // visible_eles.style('visibility','visible');
      // visible_eles.nodes().forEach(e=>this.setStyleNode(e));
      // visible_eles.edges().forEach(e=>this.setStyleEdge(e));
      cy.delay(100);
      invisible_eles.style('display','none');
      // invisible_eles.style('visibility','hidden');
      cy.delay(100);
      cy.fit( this.cy.elements().filter(e=>e.visible()), 50);
    });
    // cy.resize();
  }

  initGraph(g:IGraph){
    let vids = new Map<string,IElement>( g.nodes.map((e,i)=>{
      e.scratch['_idx'] = i;    // for elgrapho
      return [e.data.id, e];
    }) );
    g.edges = this.connectedEdges( g.edges, vids);

    // STEP4) set colors with own label
    this.setColors(g.labels);

    let pan = g.hasOwnProperty('pan') ? g['pan'] : { x:0, y:0 };
    let config:any = Object.assign( _.cloneDeep(CY_CONFIG), {
      container: this.divCy.nativeElement,
      elements: _.concat(g.nodes, g.edges),
      style: CY_STYLES,
      pan: pan,
      ready: (e)=>{
        let cy = e.cy;
        cy.scratch('_datasource', g.datasource);
        cy.nodes().forEach(e => this.setStyleNode(e));
        cy.edges().forEach(e => this.setStyleEdge(e));
      }
    });

    this.cyInit(config);
  }

  loadGraphData(g:IGraph){
    this.cy.batch(()=>{
      if( this.g.nodes.length > 0 ){
        this.cy.add( this.g.nodes );
      }
      if( this.g.edges.length > 0 ){
        this.cy.add( this.g.edges );
      }
      // ready
      this.cy.scratch('_datasource', g.datasource);
      this.cy.nodes().forEach(e => this.setStyleNode(e));
      this.cy.edges().forEach(e => this.setStyleEdge(e));
    });
  }

  cyInit(config:any){
    cytoscape.warnings(false);                 // ** for PRODUCT : custom wheel sensitive
    this.cy = window['cy'] = cytoscape(config);

    // make linking el-events to inner
    this.cy._private.emitter.$customFn = (e)=>this.cyEventsMapper(e);
    ///////////////////////////////
    // register event-handlers
    ///////////////////////////////
    let cy = this.cy;

    // right-button click : context-menu on node
    cy.on('cxttap', (e)=>{
      if( e.target === cy ){
        console.log("cxttap :", <MouseEvent>e.orignalEvent);
      }
      e.preventDefault();
      e.stopPropagation();
    });

    // ** 탭 이벤트를 cyEventsMapper()로 전달
    cy.on('tap', (e)=>{
      let tappedNow = event.target;
      if( this.tappedTimeout && this.tappedBefore) {
        clearTimeout(this.tappedTimeout);
      }
      if( this.tappedBefore === tappedNow ){
        e.target.trigger('doubleTap', e);
        e.originalEvent = undefined;
        this.tappedBefore = null;
      }
      else{
        this.tappedTimeout = setTimeout(()=>{
          if( e.target === cy ){    // click background
            cy._private.emitter.$customFn({ type: 'idle', data: e.target });
          }                         // click node or edge
          else if( e.target.isNode() || e.target.isEdge() ){
            cy._private.emitter.$customFn({ type: 'ele-click', data: e.target });
          }
          this.tappedBefore = null;
        }, 300);
        this.tappedBefore = tappedNow;
      }
    });

    // trigger doubleTap event
    // https://stackoverflow.com/a/44160927/6811653
    cy.on('doubleTap', _.debounce( (e, originalTapEvent) => {
      if( e.target !== cy && e.target.isNode() ){
        cy._private.emitter.$customFn({ type: 'node-dblclick', data: e.target });
      }
    }), 500);

    cy.on('boxselect', _.debounce( (e)=>{
      // cy.$(':selected').nodes().grabify();
    }), 500);

    cy.on('dragfree','node', (e)=>{
      let pos = e.target.position();
      e.target.scratch('_pos', _.clone(pos));
    });

    cy.on('select','node', (e)=>{
      e.target.style('background-color', '#fff');
      if( !e.target.hasClass('seed')) e.target.style('border-color', e.target.scratch('_color'));
      e.target.style('border-opacity', 1);
      if( !e.target.hasClass('seed')) e.target.style('z-index', 9);
      if( e.target.scratch('_tippy') ) e.target.scratch('_tippy').hide();
    });

    cy.on('unselect','node', (e)=>{
      // e.target.ungrabify();
      e.target.style('background-color', e.target.scratch('_color'));
      if( !e.target.hasClass('seed')) e.target.style('border-color', '#fff');
      if( e.target.hasClass('icon')) e.target.style('border-opacity', 0);
      if( !e.target.hasClass('highlighted') && !e.target.hasClass('seed') ) e.target.style('z-index', 0);
      if( e.target.scratch('_tippy') ) e.target.scratch('_tippy').hide();
    });

    // ** node 선택을 위한 편의 기능 (뭉쳤을때)
    cy.on('mouseover', 'node', _.debounce( (e)=>{
      let node = e.target;
      if( node && !node.selected() ){
        if( !node.hasClass('faded') ){        // show
          if( !node.hasClass('highlighted') && !node.hasClass('seed') ) node.style('z-index', 1);
          // node.scratch('_tippy').show();
          setTimeout(()=>{                    // auto-hide
            if( !node.hasClass('highlighted') && node.hasClass('seed') ) node.style('z-index', 0);
          }, 2000);
        }
      }
    }, 200));

  }

  cyEventsMapper(evt:any){
    if( evt.type === 'ele-click' ){
      this.cyElementClick(evt.data);
    }
    else if( evt.type === 'node-dblclick' ){
      this.cyNodeDblClick(evt.data);
    }
    else if( evt.type === 'idle' ){
      this.cyBgIdle(evt.data);
    }
    this.cyPrevEvent = evt;
  }

  cyElementClick(target:any){
    let e = target.size() > 1 ? target.first() : target;
    let json = <IElement>e.json();      // expand 된 개체는 g 모체에 없기 때문에 직접 추출
    json.scratch = e.scratch();         // json() 출력시 scratch 는 누락됨
    // this.actionEmitter.emit(<IUserEvent>{
    //   type: 'property-show',
    //   data: json   //{ index: e.isNode() ? 'v' : 'e', id: e.id() }
    // });
    let tippyHandler = this.cyMakeTippy(e, e.id());
    this.tippyHandlers.push(tippyHandler);
    tippyHandler.show();

    if( e.isEdge() ){
      // edge 선택시 연결된 source, target nodes 도 함께 선택
      // ==> mouse drag 가능해짐 (양끝 노드 하나를 붙잡고 이동)
      setTimeout(()=>{
        this.cy.batch(()=>{
          e.source().select();
          e.target().select();
        });
      }, 2);
    }
    // else this.cyHighlight(e);
  }

  cyNodeDblClick(target:any){
    let e = target.size() > 1 ? target.first() : target;

    // for DEBUG
    if( localStorage.getItem('debug')=='true' ) console.log('DblClick('+this.tappedCount+'):', e.id());

    if( this.tappedTarget == e ) this.tappedCount += 1;
    else{
      this.tappedCount = 1;
      this.tappedTarget = e;
    }

    let eles = this.cy.collection().add(e);
    for( let i=0; i<this.tappedCount; i+=1 ){
      eles = eles.union( eles.neighborhood() );
    }

    // eles.grabify();
    eles.select();
  }

  cyBgIdle(target){
    // this.actionEmitter.emit(<IUserEvent>{
    //   type: 'property-hide',
    //   data: this.cyPrevEvent.type !== 'idle'
    // });
    if( this.tippyHandlers.length > 0 ){
      this.tippyHandlers.forEach(x=>x.hide());
      this.tippyHandlers = [];
    }

    // // reset doubleTap
    if( this.tappedTarget ){
      this.tappedCount = 0;
      this.tappedTarget = null;
    }

    // when label selection, the others set faded
    // ==> release faded style
    this.cy.batch(()=>{   // ==> without triggering redraws
      // this.cy.$('node:selected').ungrabify();
      this.cy.nodes().forEach(e=>{ if(e.scratch('_tippy')) e.scratch('_tippy').hide(); });
    });
    this.cy.$(':selected').unselect();
  }

  // **NOTE: cytoscape.js-popper with tippy
  // https://github.com/cytoscape/cytoscape.js-popper/blob/master/demo-tippy.html
  cyMakeTippy(e, text){
    let ref = e.popperRef();
    let dummyDomEle = document.createElement('div');
    let html = `<small>[${e.data('label')}]</small><div class="tippy"><h6>${e.id()}</h6><ul style="list-style-type: square; padding-left:1rem; margin-left:0.1rem;">`;
    for( let key of Object.keys(e.data('properties'))){
      html += `<li>${key}: ${e.data('properties')[key]}</li>`;
    }
    html += `</ul></div>`;
    return tippy( dummyDomEle, {
      onCreate: function(instance){
        instance.popperInstance.reference = ref;
      },
      lazy: false,
      trigger: 'manual',
      content: function(){
        var div = document.createElement('div');
        div.innerHTML = html;
        return div;
      },
      arrow: true,
      placement: 'bottom',
      hideOnClick: false,
      multiple: true,
      sticky: true,
      // if interactive:
      interactive: true,
      appendTo: document.body
    });
  };

}

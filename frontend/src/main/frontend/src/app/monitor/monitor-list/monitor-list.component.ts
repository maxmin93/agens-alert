import { Component, AfterViewInit, NgZone } from '@angular/core';
import { FormGroup, FormBuilder } from '@angular/forms';
// import { Observable, of, Subject, timer, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';

import {NgbModal, ModalDismissReasons} from '@ng-bootstrap/ng-bootstrap';

import { AmApiService } from '../../services/am-api.service';
import { IQuery, IAggregation } from '../../services/agens-event-types';
import { DATE_UTILS } from '../../services/agens-util-funcs';
import * as _ from 'lodash';

import * as am4core from "@amcharts/amcharts4/core";
import * as am4charts from "@amcharts/amcharts4/charts";
import am4themes_animated from "@amcharts/amcharts4/themes/animated";
import { isInteger } from '@ng-bootstrap/ng-bootstrap/util/util';

am4core.useTheme(am4themes_animated);

@Component({
  selector: 'app-monitor-list',
  templateUrl: './monitor-list.component.html',
  styleUrls: ['./monitor-list.component.scss']
})
export class MonitorListComponent implements AfterViewInit {

  heading = 'Monitor List';
  subheading = 'This is an real-time monitor list for Agenspop.';
  icon = 'pe-7s-plane icon-gradient bg-tempting-azure';

  page = 1;
  pageSize = 5;

  selectedQuery:IQuery = null;
  editQueryForm: FormGroup;

  datasources:string[] = [];
  queries:IQuery[] = [];
  aggregations:IAggregation[] = [];

  chartData = {
    data: [],
    qids: [],
    from: null,
    to: null
  };
  qids:any[] = [];
  maxDate:Date = null;
  minDate:Date = null;

  private chart: am4charts.XYChart;

  constructor(
    private amApiService: AmApiService,
    private fb: FormBuilder,
    private modalService: NgbModal,
    private zone: NgZone
  ) { }

  ngAfterViewInit() {
    this.editQueryForm = this.fb.group({
      id: null,
      active_yn: false,
      name: '',
      datasource: '',
      query: ''
    });

    this.doInitChart();
  }

  ngOnDestroy() {
    this.doDestoryChart();
  }

  doInitChart(){
    let queries$ = this.amApiService.findQueries();
    queries$.pipe(map(q=><IQuery[]>q)).subscribe(rows => {
      this.queries = rows;
    });

    let datasources$ = this.amApiService.findDatasources();
    datasources$.subscribe(r => {
      this.datasources = Object.keys(r);
    });

    let aggregations$ = this.amApiService.findAggregations();
    aggregations$.pipe(map(q=><IAggregation[]>q)).subscribe(rows => {
      this.aggregations = _.sortBy(rows, ['edate','qid']);
      this.chartData = this.makeChartData(this.aggregations);

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
      this.doInitChart();
    }
  }

/*
Data format for XYChart
============================
date : Date
<qid[0]>: ids_cnt of qid[0]
...
<qid[n]>: ids_cnt of qid[n]
total : sum of all ids_cnt
*/

  makeChartData(sorted: IAggregation[]): any {
    let chartData : any = {};
    if( _.isNull(sorted) || sorted.length == 0 ) return chartData;

    // get min and max date
    //  - order by edate, qid
    chartData['from'] = sorted[0].edate;
    chartData['to'] = sorted[sorted.length-1].edate;

    // get unique array of qid(s)
    chartData['qids'] = _.uniq(_.map(sorted, r=>r.qid));
    chartData['data'] = [];

    // make any array
    //  - loop : min date ~ max date
    let fromDate = new Date(chartData['from'])
    let dayCount = DATE_UTILS.diffDays(fromDate, new Date(chartData['to']));
    for( let idx=0; idx <= dayCount; idx+=1 ){
      let curr = DATE_UTILS.afterDays(fromDate, idx);
      let currString = DATE_UTILS.toYYYYMMDD(curr);
      let row:any = { date: curr, total: 0 };
      //  - loop : each qid
      for( let qid of chartData['qids'] ){
        let matched = _.find(sorted, r=>r.qid == qid && r.edate == currString );
        if( matched != undefined ){
          row[qid+''] = matched.ids_cnt;
          row['total'] += matched.ids_cnt;
        }
        else{
          row[qid+''] = 0;
        }
      }
      chartData['data'].push(row);
    }

    // console.log('chartData:', chartData);
    return chartData;
  }

initChart(chartData: any):am4charts.XYChart {
    let chart = am4core.create("chartdiv", am4charts.XYChart);
    chart.paddingRight = 40;

    chart.colors.step = 3;
    chart.data = chartData['data'];

    // the following line makes value axes to be arranged vertically.
    chart.leftAxesContainer.layout = "vertical";

    // uncomment this line if you want to change order of axes
    //chart.bottomAxesContainer.reverseOrder = true;

    let dateAxis = chart.xAxes.push(new am4charts.DateAxis());
    dateAxis.renderer.grid.template.location = 0;
    dateAxis.renderer.ticks.template.length = 8;
    dateAxis.renderer.ticks.template.strokeOpacity = 0.1;
    dateAxis.renderer.grid.template.disabled = true;
    dateAxis.renderer.ticks.template.disabled = false;
    dateAxis.renderer.ticks.template.strokeOpacity = 0.2;
    dateAxis.renderer.minLabelPosition = 0.01;
    dateAxis.renderer.maxLabelPosition = 0.99;
    dateAxis.keepSelection = true;

    dateAxis.groupData = false;   // true;
    dateAxis.minZoomCount = 5;

    // dateAxis.dateFormatter = new am4core.DateFormatter();
    // dateAxis.dateFormatter.dateFormat = 'yyyy-MM-dd';
    dateAxis.dateFormats.setKey("day", "yyyy-MM-dd");

    // these two lines makes the axis to be initially zoomed-in
    // dateAxis.start = 0.7;
    // dateAxis.keepSelection = true;

    let valueAxis = chart.yAxes.push(new am4charts.ValueAxis());
    valueAxis.tooltip.disabled = true;
    valueAxis.zIndex = 1;
    valueAxis.renderer.baseGrid.disabled = true;
    // height of axis
    valueAxis.height = am4core.percent(65);

    valueAxis.renderer.gridContainer.background.fill = am4core.color("#000000");
    valueAxis.renderer.gridContainer.background.fillOpacity = 0.05;
    valueAxis.renderer.inside = true;
    valueAxis.renderer.labels.template.verticalCenter = "bottom";
    valueAxis.renderer.labels.template.padding(2, 2, 2, 2);

    //valueAxis.renderer.maxLabelPosition = 0.95;
    valueAxis.renderer.fontSize = "0.8em"

    if( chartData['qids'] ){
      for( let qid of chartData['qids'] ){
        let series = chart.series.push(new am4charts.LineSeries());
        series.dataFields.dateX = "date";
        series.dataFields.valueY = qid+'';
        series.dataFields.valueYShow = 'value';   // "changePercent";
        series.tooltipText = "{name}: {valueY.value}";  //changePercent.formatNumber('[#0c0]+#.00|[#c00]#.##|0')}%";
        let qry = _.find(this.queries, q=>q.id == qid);
        series.name = (qry != undefined) ? qry.name : '[qid] '+qid;
        series.tooltip.getFillFromObject = false;
        series.tooltip.getStrokeFromObject = true;
        series.tooltip.background.fill = am4core.color("#fff");
        series.tooltip.background.strokeWidth = 2;
        series.tooltip.label.fill = series.stroke;
      }
    }

    // -----------------------------------
    // **NOTE: 하단의 막대그래프 (별도의 Y축) => 그래서 valueAxis2
    // -----------------------------------
    let valueAxis2 = chart.yAxes.push(new am4charts.ValueAxis());
    valueAxis2.tooltip.disabled = true;
    // height of axis
    valueAxis2.height = am4core.percent(35);
    valueAxis2.zIndex = 3
    // this makes gap between panels
    valueAxis2.marginTop = 30;
    valueAxis2.renderer.baseGrid.disabled = true;
    valueAxis2.renderer.inside = true;
    valueAxis2.renderer.labels.template.verticalCenter = "bottom";
    valueAxis2.renderer.labels.template.padding(2, 2, 2, 2);
    //valueAxis.renderer.maxLabelPosition = 0.95;
    valueAxis2.renderer.fontSize = "0.8em";

    valueAxis2.renderer.gridContainer.background.fill = am4core.color("#000000");
    valueAxis2.renderer.gridContainer.background.fillOpacity = 0.05;

    let volumeSeries = chart.series.push(new am4charts.StepLineSeries());
    volumeSeries.fillOpacity = 1;
    volumeSeries.fill = chart.series.getIndex(0).fill;    // .stroke;
    volumeSeries.stroke = chart.series.getIndex(0).stroke;
    volumeSeries.dataFields.dateX = "date";
    volumeSeries.dataFields.valueY = "total";
    volumeSeries.yAxis = valueAxis2;
    volumeSeries.tooltipText = "Volume: {valueY.value}";
    volumeSeries.name = "Total Count";
    // volume should be summed
    volumeSeries.groupFields.valueY = "sum";
    volumeSeries.tooltip.label.fill = volumeSeries.fill;    // stroke;
    chart.cursor = new am4charts.XYCursor();
    chart.legend = new am4charts.Legend();

    // -----------------------------------
    // **NOTE: 상단에 X축 스크롤바
    // -----------------------------------
    // let scrollbarX = new am4charts.XYChartScrollbar();
    // scrollbarX.series.push(chart.series.getIndex(0));
    // scrollbarX.marginBottom = 20;
    // let sbSeries = scrollbarX.scrollbarChart.series.getIndex(0);
    // sbSeries.dataFields.valueYShow = undefined;
    // chart.scrollbarX = scrollbarX;

    return chart;
  }


  /////////////////////////////////////////////////////////////////////////

  // closeResult: string;

  deleteQuery(item:IQuery){
    let idx = _.findIndex(this.queries, q=>q.id == item.id);
    if (confirm(`Are you sure to remove query #${item.id} "${item.name}"?`)) {
      this.amApiService.deleteQuery(item.id).subscribe(r=>{
        console.log('deleted:', r);
        // remove query by index on array
        if( r > 0 ) this.queries.splice(idx,1);
      });
    }
  }

  changeStateQuery(item:IQuery){
    let state = !item.active_yn;
    this.amApiService.changeStateQuery(item.id, state).subscribe(r=>{
      console.log(`changeStatus: ${item.active_yn} to ${state} => ${r}`);
      if( Number.parseInt(r) > 0 ){
        item.active_yn = state;
        item.up_date = new Date();
      }
    });
  }

  openQuery($modal, item:IQuery){
    this.selectedQuery = item;
    if( item ){   // edit query
      this.editQueryForm.patchValue({
        id: item.id,
        active_yn: item.active_yn,
        name: item.name,
        datasource: item.datasource,
        query: item.script
      });
    }
    else{         // new query
      this.editQueryForm.patchValue({
        id: null,
        active_yn: false,
        name: '',
        datasource: '',
        query: ''
      });
    }

    this.modalService.open($modal).result.then((result) => {
      let formData = this.editQueryForm.getRawValue();
      if( item ){   // update query
        this.amApiService.updateQuery(<IQuery>formData)
          .subscribe(r=>{
            console.log('updateQuery:', r);
            if( !r['cr_date'] ) r['cr_date'] = r['up_date'];
            // update queries with finding qid
            let idx = _.findIndex(this.queries, q=>q.id == item.id);
            this.queries[idx] = _.clone(r);
          });
      }
      else{
        this.amApiService.addQuery(<IQuery>formData)
          .subscribe(r=>{
            console.log('addQuery:', r);
            // append new query to queries
            if( !r['cr_date'] ) r['cr_date'] = r['up_date'];
            this.queries.push(<IQuery>r);
          });
      }
    }, (reason) => {
      // this.closeResult = `Dismissed ${this.getDismissReason(reason)}`;
      // console.log(this.closeResult);
    });
  }

  private getDismissReason(reason: any): string {
    if (reason === ModalDismissReasons.ESC) {
      return 'by pressing ESC';
    } else if (reason === ModalDismissReasons.BACKDROP_CLICK) {
      return 'by clicking on a backdrop';
    } else {
      return `with: ${reason}`;
    }
  }

}

package net.bitnine.ag3.agensalert.gremlin

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.reactive.asFlow
import kotlinx.coroutines.reactive.awaitFirstOrNull

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Service
import reactor.core.publisher.Flux
import javax.annotation.PostConstruct


@Service
class AgenspopService(
        @Autowired private val client: AgenspopClient
){
    // @PostConstruct 안됨
    // ==> IllegalStateException: Lifecycle method annotation requires a no-arg method

    suspend fun findDatasources() =
            client.findDatasources().awaitFirstOrNull()

    suspend fun findNeighborsOfOne(datasource:String, vid:String) =
            client.findNeighborsOfOne(datasource, vid).awaitFirstOrNull()

    suspend fun findNeighborsOfGrp(datasource:String, ids:List<String>) =
            client.findNeighborsOfGrp(datasource, ids).asFlow()

    suspend fun findConnectedEdges(datasource:String, ids: List<String>) =
            client.findConnectedEdges(datasource, ids).asFlow()

    suspend fun findConnectedVertices(datasource:String, ids: List<String>) =
            client.findConnectedVertices(datasource, ids).asFlow()

    suspend fun findVertices(datasource:String, ids: List<String>) =
            client.findVertices(datasource, ids).asFlow()

    suspend fun findEdges(datasource:String, ids: List<String>) =
            client.findEdges(datasource, ids).asFlow()

    suspend fun findElements(datasource:String, ids: List<String>) =
            Flux.concat( client.findVertices(datasource, ids), client.findEdges(datasource, ids) ).asFlow()

    suspend fun execGremlin(datasource:String, script: String) =
            client.execGremlin(datasource, script).asFlow()

    suspend fun execGremlin(datasource:String, script: String, fromDate:String, toDate:String?=null) =
            client.execGremlinWithRange(datasource, script, fromDate, toDate).asFlow()

    suspend fun findIdsWithTimeRange(ids: List<String>, fromDate: String, fromTime: String?): Flow<Map<*, *>> {

//        var dateValue: LocalDate? = null
//        var timeValue: LocalTime? = null
//        try {
//            dateValue = LocalDate.parse(fromDate, DateTimeFormatter.ISO_LOCAL_DATE);
//            timeValue = LocalTime.parse( if(fromTime.isNullOrBlank()) "00:00:00" else fromTime,
//                    DateTimeFormatter.ISO_LOCAL_TIME);
//        }
//        catch (e: DateTimeParseException){ }
//        if( dateValue == null || timeValue == null ) return emptyFlow()

        val fromDateTime = "${fromDate} ${if(fromTime.isNullOrBlank()) "00:00:00" else fromTime}"
        // println("findIdsWithTimeRange(${fromDateTime}~): ${ids}")
        return client.findElementsWithDateRange(ids, fromDateTime, null).asFlow()
    }


}
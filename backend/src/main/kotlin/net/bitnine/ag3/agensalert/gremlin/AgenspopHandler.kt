package net.bitnine.ag3.agensalert.gremlin

import net.bitnine.ag3.agensalert.event.ErrorMessage

import kotlinx.coroutines.reactive.awaitFirstOrNull

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.server.*


@Component
class AgenspopHandler(@Autowired val service: AgenspopService) {
    private val logger = LoggerFactory.getLogger(AgenspopHandler::class.java)

    suspend fun hello(request: ServerRequest): ServerResponse {
        return ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValueAndAwait( mapOf("msg" to "Hello, AgenspopHandler!") )
    }

    suspend fun findDatasources(request: ServerRequest): ServerResponse {
        return ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValueAndAwait(service.findDatasources()!!)
    }

/*
    suspend fun findNeighbors(datasource:String, vid:String) =
            client.findNeighbors(datasource, vid).awaitFirstOrNull()

    suspend fun findConnectedEdges(datasource:String, vids: List<String>) =
            client.findConnectedEdges(datasource, vids).asFlow()

    suspend fun findVertices(datasource:String, ids: List<String>) =
            client.findVertices(datasource, ids).asFlow()

    suspend fun findEdges(datasource:String, ids: List<String>) =
            client.findEdges(datasource, ids).asFlow()

    suspend fun findElements(datasource:String, ids: List<String>) =
            Flux.concat( client.findVertices(datasource, ids), client.findEdges(datasource, ids) ).asFlow()

 */
    suspend fun findNeighborsOfOne(request: ServerRequest): ServerResponse {
        val criterias = request.queryParams()
        return when {
            criterias.isEmpty() -> ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Search must have query params"))
            criterias.contains("datasource")&&criterias.contains("q") -> {
                val datasource = criterias.getFirst("datasource")
                val vid = criterias.getFirst("q")
                if (datasource.isNullOrBlank() || vid.isNullOrBlank()) {
                    ServerResponse.badRequest().json()
                            .bodyValueAndAwait(ErrorMessage("Incorrect search criteria value: "
                                    +"datasource, q"))
                } else {
                    ServerResponse.ok().json()
                            .bodyValueAndAwait(service.findNeighborsOfOne(datasource,vid)!!)
                }
            }
            else -> ServerResponse.badRequest().json()
                            .bodyValueAndAwait(ErrorMessage("Incorrect search criteria"))
        }
    }

    suspend fun findNeighborsOfGrp(request: ServerRequest): ServerResponse {
        val params = try {
            request.bodyToMono<Map<String,String>>().awaitFirstOrNull()
        } catch (e: Exception) {
            logger.error("Decoding body error", e)
            null
        }

        return if (params == null) {
            ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Search must have query params"))
        } else {
            val datasource = params.get("datasource")
            val ids:List<String>? = params.get("q")?.split(",")
            if (datasource.isNullOrBlank() || ids.isNullOrEmpty()) {
                ServerResponse.badRequest().json()
                        .bodyValueAndAwait(ErrorMessage("Incorrect search criteria value: "
                                +"datasource, q"))
            } else {
                ServerResponse.ok().json()
                        .bodyAndAwait(service.findNeighborsOfGrp(datasource,ids)!!)
            }
        }
    }

    suspend fun findConnectedVertices(request: ServerRequest): ServerResponse {
        val params = try {
            request.bodyToMono<Map<String,String>>().awaitFirstOrNull()
        } catch (e: Exception) {
            logger.error("Decoding body error", e)
            null
        }

        return if (params == null) {
            ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Search must have query params"))
        } else {
            val datasource = params.get("datasource")
            val ids:List<String>? = params.get("q")?.split(",")
            if (datasource.isNullOrBlank() || ids.isNullOrEmpty()) {
                ServerResponse.badRequest().json()
                        .bodyValueAndAwait(ErrorMessage("Incorrect search criteria value: "
                                +"datasource, q"))
            } else {
                ServerResponse.ok().json()
                        .bodyAndAwait(service.findConnectedVertices(datasource,ids)!!)
            }
        }
    }

    suspend fun findConnectedEdges(request: ServerRequest): ServerResponse {
        val params = try {
            request.bodyToMono<Map<String,String>>().awaitFirstOrNull()
        } catch (e: Exception) {
            logger.error("Decoding body error", e)
            null
        }

        return if (params == null) {
            ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Search must have query params"))
        } else {
            val datasource = params.get("datasource")
            val ids:List<String>? = params.get("q")?.split(",")
            if (datasource.isNullOrBlank() || ids.isNullOrEmpty()) {
                ServerResponse.badRequest().json()
                        .bodyValueAndAwait(ErrorMessage("Incorrect search criteria value: "
                                +"datasource, q"))
            } else {
                ServerResponse.ok().json()
                        .bodyAndAwait(service.findConnectedEdges(datasource,ids)!!)
            }
        }
    }

    suspend fun findVertices(request: ServerRequest): ServerResponse {
        val criterias = request.queryParams()
        return when {
            criterias.isEmpty() -> ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Search must have query params"))
            criterias.contains("datasource")&&criterias.contains("q") -> {
                val datasource = criterias.getFirst("datasource")
                val ids:List<String>? = criterias.getFirst("q")?.split(",")
                if (datasource.isNullOrBlank() || ids.isNullOrEmpty()) {
                    ServerResponse.badRequest().json()
                            .bodyValueAndAwait(ErrorMessage("Incorrect search criteria value: "
                                    +"datasource, q"))
                } else {
                    ServerResponse.ok().json()
                            .bodyAndAwait(service.findVertices(datasource,ids)!!)
                }
            }
            else -> ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Incorrect search criteria"))
        }
    }

    suspend fun findEdges(request: ServerRequest): ServerResponse {
        val criterias = request.queryParams()
        return when {
            criterias.isEmpty() -> ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Search must have query params"))
            criterias.contains("datasource")&&criterias.contains("q") -> {
                val datasource = criterias.getFirst("datasource")
                val ids:List<String>? = criterias.getFirst("q")?.split(",")
                if (datasource.isNullOrBlank() || ids.isNullOrEmpty()) {
                    ServerResponse.badRequest().json()
                            .bodyValueAndAwait(ErrorMessage("Incorrect search criteria value: "
                                    +"datasource, q"))
                } else {
                    ServerResponse.ok().json()
                            .bodyAndAwait(service.findEdges(datasource,ids)!!)
                }
            }
            else -> ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Incorrect search criteria"))
        }
    }

    suspend fun findElements(request: ServerRequest): ServerResponse {
        val params = try {
            request.bodyToMono<Map<String,String>>().awaitFirstOrNull()
        } catch (e: Exception) {
            logger.error("Decoding body error", e)
            null
        }

        return if (params == null) {
            ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Search must have query params"))
        } else {
            val datasource = params.get("datasource")
            val ids:List<String>? = params.get("q")?.split(",")
            if (datasource.isNullOrBlank() || ids.isNullOrEmpty()) {
                ServerResponse.badRequest().json()
                        .bodyValueAndAwait(ErrorMessage("Incorrect search criteria value: "
                                +"datasource, q"))
            } else {
                ServerResponse.ok().json()
                        .bodyAndAwait(service.findElements(datasource,ids)!!)
            }
        }
    }

    suspend fun execGremlin(request: ServerRequest): ServerResponse {
        val params = try {
            request.bodyToMono<Map<String,String>>().awaitFirstOrNull()
        } catch (e: Exception) {
            logger.error("Decoding body error", e)
            null
        }
        return if (params == null) {
            ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Search must have query params"))
        } else {
            val datasource = params.get("datasource")
            val script = params.get("q")
            if (datasource.isNullOrBlank() || script.isNullOrBlank()) {
                ServerResponse.badRequest().json()
                        .bodyValueAndAwait(ErrorMessage("Incorrect search criteria value: "
                                +"datasource, q"))
            } else {
                ServerResponse.ok().json()
                        .bodyAndAwait(service.execGremlin(datasource,script)!!)
            }
        }
    }

    suspend fun execGremlinWithRange(request: ServerRequest): ServerResponse {
        val params = try {
            request.bodyToMono<Map<String,String>>().awaitFirstOrNull()
        } catch (e: Exception) {
            logger.error("Decoding body error", e)
            null
        }
        return if (params == null) {
            ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Search must have query params"))
        } else {
            val datasource = params.get("datasource")
            val script = params.get("q")
            val fromDate = params.get("from")
            val toDate = params.get("to")
            if (datasource.isNullOrBlank() || script.isNullOrBlank() || fromDate.isNullOrBlank()) {
                ServerResponse.badRequest().json()
                        .bodyValueAndAwait(ErrorMessage("Incorrect search criteria value: "
                                +"datasource, q, from"))
            } else {
                ServerResponse.ok().json()
                        .bodyAndAwait(service.execGremlin(datasource,script,fromDate,toDate)!!)
            }
        }
    }

    suspend fun findIdsWithTimeRange(request: ServerRequest): ServerResponse {
        val params = try {
            request.bodyToMono<Map<String,Any?>>().awaitFirstOrNull()
        } catch (e: Exception) {
            logger.error("Decoding body error", e)
            null
        }

        return if (params == null) {
            ServerResponse.badRequest().json()
                    .bodyValueAndAwait(ErrorMessage("Search must have query params"))
        } else {
            val ids:List<String>? = params.get("q") as List<String>
            val fromDate:String? = params.get("date") as String
            val fromTime:String? = params.get("time") as String
            // println("findIdsWithTimeRange(${fromDate}T${fromTime}~): ${ids}")

            if (ids.isNullOrEmpty() || fromDate.isNullOrBlank()) {
                ServerResponse.badRequest().json()
                        .bodyValueAndAwait(ErrorMessage("Incorrect search criteria value: "
                                +"q(=ids), date"))
            } else {
                ServerResponse.ok().json()
                        .bodyAndAwait(service.findIdsWithTimeRange(ids, fromDate, fromTime))
            }
        }
    }
}

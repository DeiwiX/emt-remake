-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: localhost
-- Tiempo de generación: 28-10-2026 a las 12:23:40
-- Versión del servidor: 10.4.28-MariaDB
-- Versión de PHP: 8.0.28

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `comisaria`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `agentes`
--

CREATE TABLE `agentes` (
  `placa` varchar(10) NOT NULL,
  `nombre` varchar(60) NOT NULL,
  `rango` varchar(20) NOT NULL,
  `id_comisaria` int(11) NOT NULL,
  `fecha_ingreso` date NOT NULL
) ;

--
-- Volcado de datos para la tabla `agentes`
--

INSERT INTO `agentes` (`placa`, `nombre`, `rango`, `id_comisaria`, `fecha_ingreso`) VALUES
('PL-0101', 'Rafael Ortega Valls', 'COMISARIO', 1, '2002-09-16'),
('PL-0102', 'Lucía Márquez Peña', 'INSPECTOR', 1, '2011-02-07'),
('PL-0103', 'Andrés Cabello Ruiz', 'SUBINSPECTOR', 1, '2014-06-23'),
('PL-0104', 'Marta Jiménez Soto', 'AGENTE', 1, '2019-10-01'),
('PL-0105', 'Sergio Durán Lara', 'AGENTE', 1, '2021-03-15'),
('PL-0106', 'Noelia Rueda Gil', 'AGENTE', 1, '2023-09-04'),
('PL-0201', 'Javier Salas Ortiz', 'INSPECTOR', 2, '2010-05-17'),
('PL-0202', 'Elena Molina Vega', 'SUBINSPECTOR', 2, '2015-01-12'),
('PL-0203', 'Pablo Reyes Cano', 'AGENTE', 2, '2018-11-26'),
('PL-0204', 'Irene Campos Luna', 'AGENTE', 2, '2022-02-14'),
('PL-0301', 'Carmen Prieto Rojas', 'INSPECTOR', 3, '2009-04-20'),
('PL-0302', 'Daniel Herrera Bravo', 'AGENTE', 3, '2017-07-03'),
('PL-0303', 'Laura Nieto Parra', 'AGENTE', 3, '2020-09-28'),
('PL-0401', 'Miguel Ángel Cortés Mora', 'SUBINSPECTOR', 4, '2013-03-11'),
('PL-0402', 'Alba Ferrer Gómez', 'AGENTE', 4, '2020-01-20'),
('PL-0403', 'Hugo Barea Lozano', 'AGENTE', 4, '2024-06-10');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `asignaciones`
--

CREATE TABLE `asignaciones` (
  `id_caso` int(11) NOT NULL,
  `placa_agente` varchar(10) NOT NULL,
  `rol` varchar(15) NOT NULL,
  `fecha_asignacion` date NOT NULL
) ;

--
-- Volcado de datos para la tabla `asignaciones`
--

INSERT INTO `asignaciones` (`id_caso`, `placa_agente`, `rol`, `fecha_asignacion`) VALUES
(1, 'PL-0102', 'INSTRUCTOR', '2026-03-10'),
(1, 'PL-0104', 'APOYO', '2026-03-12'),
(2, 'PL-0102', 'INSTRUCTOR', '2026-05-22'),
(2, 'PL-0105', 'APOYO', '2026-05-23'),
(2, 'PL-0106', 'APOYO', '2026-05-25'),
(3, 'PL-0102', 'INSTRUCTOR', '2026-07-14'),
(4, 'PL-0102', 'INSTRUCTOR', '2026-09-03'),
(4, 'PL-0103', 'APOYO', '2026-09-04'),
(5, 'PL-0102', 'INSTRUCTOR', '2026-10-15'),
(6, 'PL-0103', 'INSTRUCTOR', '2025-11-02'),
(6, 'PL-0104', 'APOYO', '2025-11-04'),
(7, 'PL-0103', 'INSTRUCTOR', '2026-01-18'),
(7, 'PL-0105', 'APOYO', '2026-01-19'),
(8, 'PL-0103', 'INSTRUCTOR', '2026-10-20'),
(9, 'PL-0201', 'INSTRUCTOR', '2026-04-05'),
(9, 'PL-0203', 'APOYO', '2026-04-06'),
(9, 'PL-0204', 'APOYO', '2026-04-08'),
(10, 'PL-0202', 'INSTRUCTOR', '2026-08-17'),
(10, 'PL-0203', 'APOYO', '2026-08-18'),
(11, 'PL-0201', 'INSTRUCTOR', '2026-10-01'),
(12, 'PL-0202', 'INSTRUCTOR', '2026-10-22'),
(13, 'PL-0301', 'INSTRUCTOR', '2026-06-09'),
(13, 'PL-0302', 'APOYO', '2026-06-10'),
(14, 'PL-0302', 'INSTRUCTOR', '2026-02-27'),
(14, 'PL-0303', 'APOYO', '2026-02-28'),
(15, 'PL-0301', 'INSTRUCTOR', '2026-09-28'),
(15, 'PL-0303', 'APOYO', '2026-09-29'),
(16, 'PL-0401', 'APOYO', '2025-12-13'),
(16, 'PL-0402', 'INSTRUCTOR', '2025-12-12'),
(17, 'PL-0401', 'INSTRUCTOR', '2026-10-10');

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `carga_comisarias`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `carga_comisarias` (
`id_comisaria` int(11)
,`nombre` varchar(60)
,`num_agentes` bigint(21)
,`casos_sin_cerrar` bigint(21)
);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `casos`
--

CREATE TABLE `casos` (
  `id` int(11) NOT NULL,
  `fecha_apertura` date NOT NULL,
  `descripcion` varchar(200) NOT NULL,
  `id_tipo` int(11) NOT NULL,
  `dni_denunciante` varchar(9) NOT NULL,
  `id_comisaria` int(11) NOT NULL,
  `estado` varchar(20) NOT NULL,
  `fecha_cierre` date DEFAULT NULL
) ;

--
-- Volcado de datos para la tabla `casos`
--

INSERT INTO `casos` (`id`, `fecha_apertura`, `descripcion`, `id_tipo`, `dni_denunciante`, `id_comisaria`, `estado`, `fecha_cierre`) VALUES
(1, '2026-03-10', 'Hurto de bolso en una terraza de calle Larios', 1, '31000001A', 1, 'EN_INVESTIGACION', NULL),
(2, '2026-05-22', 'Robo con fuerza en vivienda del barrio de Teatinos', 5, '31000002G', 1, 'EN_INVESTIGACION', NULL),
(3, '2026-07-14', 'Estafa en la compraventa de una moto de segunda mano por internet', 6, '31000003M', 1, 'ABIERTO', NULL),
(4, '2026-09-03', 'Lesiones en una pelea a la salida de un local de ocio nocturno', 7, '31000004Y', 1, 'EN_INVESTIGACION', NULL),
(5, '2026-10-15', 'Amenazas reiteradas a través de redes sociales', 4, '31000005F', 1, 'ABIERTO', NULL),
(6, '2025-11-02', 'Daños en varios vehículos aparcados en el Paseo Marítimo', 2, '31000001A', 1, 'CERRADO', '2026-01-20'),
(7, '2026-01-18', 'Venta de sustancias estupefacientes en las inmediaciones de un colegio', 9, '31000006P', 1, 'CERRADO', '2026-04-30'),
(8, '2026-10-20', 'Robo con violencia a un repartidor en la vía pública', 8, '31000007D', 1, 'ABIERTO', NULL),
(9, '2026-04-05', 'Robo con fuerza en un local comercial del casco antiguo', 5, '31000008X', 2, 'EN_INVESTIGACION', NULL),
(10, '2026-08-17', 'Hurto de pertenencias en una habitación de hotel', 1, '31000009B', 2, 'CERRADO', '2026-09-25'),
(11, '2026-10-01', 'Hallazgo de un fallecido con signos de violencia en una vivienda', 10, '31000010N', 2, 'ABIERTO', NULL),
(12, '2026-10-22', 'Disturbios y alteración del orden durante un evento musical', 3, '31000011J', 2, 'ABIERTO', NULL),
(13, '2026-06-09', 'Suplantación de identidad bancaria mediante phishing', 6, '31000012Z', 3, 'EN_INVESTIGACION', NULL),
(14, '2026-02-27', 'Destrozos en mobiliario urbano del paseo marítimo', 2, '31000013S', 3, 'CERRADO', '2026-03-15'),
(15, '2026-09-28', 'Distribución de drogas en un establecimiento de hostelería', 9, '31000014Q', 3, 'EN_INVESTIGACION', NULL),
(16, '2025-12-12', 'Hurto de una bicicleta eléctrica en un portal', 1, '31000014Q', 4, 'CERRADO', '2026-02-02'),
(17, '2026-10-10', 'Amenazas a un comerciante por una deuda', 4, '31000013S', 4, 'ABIERTO', NULL);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ciudadanos`
--

CREATE TABLE `ciudadanos` (
  `dni` varchar(9) NOT NULL,
  `nombre` varchar(60) NOT NULL,
  `telefono` varchar(15) DEFAULT NULL,
  `fecha_nacimiento` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `ciudadanos`
--

INSERT INTO `ciudadanos` (`dni`, `nombre`, `telefono`, `fecha_nacimiento`) VALUES
('31000001A', 'Manuel Ortiz Barrionuevo', '600100001', '1984-03-12'),
('31000002G', 'Rosario Vallejo Marín', '600100002', '1991-07-25'),
('31000003M', 'Francisco Javier Luque Ríos', '600100003', '1978-11-02'),
('31000004Y', 'Marina Echevarría Soto', '600100004', '2001-01-30'),
('31000005F', 'Antonio Gálvez Molina', '600100005', '1965-09-14'),
('31000006P', 'Yolanda Pastor Aranda', '600100006', '1988-05-19'),
('31000007D', 'Óscar Benítez Cuesta', '600100007', '1995-12-08'),
('31000008X', 'Teresa Cordero Villalba', '600100008', '1972-04-03'),
('31000009B', 'Ignacio Salcedo Ferrer', '600100009', '1999-08-21'),
('31000010N', 'Pilar Montero Haro', '600100010', '1957-10-17'),
('31000011J', 'Samuel Aguado Prieto', '600100011', '2003-02-27'),
('31000012Z', 'Gloria Mansilla Duque', '600100012', '1980-06-09'),
('31000013S', 'Rafael Torralba Cano', '600100013', '1969-01-15'),
('31000014Q', 'Dolores Serrano Pineda', '600100014', '1993-09-05');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `comisarias`
--

CREATE TABLE `comisarias` (
  `id` int(11) NOT NULL,
  `nombre` varchar(60) NOT NULL,
  `ciudad` varchar(40) NOT NULL,
  `telefono` varchar(15) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `comisarias`
--

INSERT INTO `comisarias` (`id`, `nombre`, `ciudad`, `telefono`) VALUES
(1, 'Comisaría Provincial de Málaga', 'Málaga', '952000101'),
(2, 'Comisaría Local de Marbella', 'Marbella', '952000202'),
(3, 'Comisaría Local de Fuengirola', 'Fuengirola', '952000303'),
(4, 'Comisaría Local de Vélez-Málaga', 'Vélez-Málaga', '952000404');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `tipos_delito`
--

CREATE TABLE `tipos_delito` (
  `id` int(11) NOT NULL,
  `descripcion` varchar(60) NOT NULL,
  `gravedad` varchar(10) NOT NULL
) ;

--
-- Volcado de datos para la tabla `tipos_delito`
--

INSERT INTO `tipos_delito` (`id`, `descripcion`, `gravedad`) VALUES
(1, 'Hurto', 'LEVE'),
(2, 'Daños a la propiedad', 'LEVE'),
(3, 'Alteración del orden público', 'LEVE'),
(4, 'Amenazas', 'LEVE'),
(5, 'Robo con fuerza', 'GRAVE'),
(6, 'Estafa informática', 'GRAVE'),
(7, 'Lesiones', 'GRAVE'),
(8, 'Robo con violencia', 'GRAVE'),
(9, 'Tráfico de drogas', 'MUY_GRAVE'),
(10, 'Homicidio', 'MUY_GRAVE');

-- --------------------------------------------------------

--
-- Estructura para la vista `carga_comisarias`
--
DROP TABLE IF EXISTS `carga_comisarias`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `carga_comisarias`  AS SELECT `c`.`id` AS `id_comisaria`, `c`.`nombre` AS `nombre`, coalesce(`a`.`num_agentes`,0) AS `num_agentes`, coalesce(`k`.`casos_sin_cerrar`,0) AS `casos_sin_cerrar` FROM ((`comisarias` `c` left join (select `agentes`.`id_comisaria` AS `id_comisaria`,count(0) AS `num_agentes` from `agentes` group by `agentes`.`id_comisaria`) `a` on(`a`.`id_comisaria` = `c`.`id`)) left join (select `casos`.`id_comisaria` AS `id_comisaria`,count(0) AS `casos_sin_cerrar` from `casos` where `casos`.`estado` <> 'CERRADO' group by `casos`.`id_comisaria`) `k` on(`k`.`id_comisaria` = `c`.`id`)) ;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `agentes`
--
ALTER TABLE `agentes`
  ADD PRIMARY KEY (`placa`),
  ADD KEY `fk_agentes_comisaria` (`id_comisaria`);

--
-- Indices de la tabla `asignaciones`
--
ALTER TABLE `asignaciones`
  ADD PRIMARY KEY (`id_caso`,`placa_agente`),
  ADD KEY `fk_asignaciones_agente` (`placa_agente`);

--
-- Indices de la tabla `casos`
--
ALTER TABLE `casos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_casos_tipo` (`id_tipo`),
  ADD KEY `fk_casos_denunciante` (`dni_denunciante`),
  ADD KEY `fk_casos_comisaria` (`id_comisaria`);

--
-- Indices de la tabla `ciudadanos`
--
ALTER TABLE `ciudadanos`
  ADD PRIMARY KEY (`dni`);

--
-- Indices de la tabla `comisarias`
--
ALTER TABLE `comisarias`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `tipos_delito`
--
ALTER TABLE `tipos_delito`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `casos`
--
ALTER TABLE `casos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `agentes`
--
ALTER TABLE `agentes`
  ADD CONSTRAINT `fk_agentes_comisaria` FOREIGN KEY (`id_comisaria`) REFERENCES `comisarias` (`id`);

--
-- Filtros para la tabla `asignaciones`
--
ALTER TABLE `asignaciones`
  ADD CONSTRAINT `fk_asignaciones_agente` FOREIGN KEY (`placa_agente`) REFERENCES `agentes` (`placa`),
  ADD CONSTRAINT `fk_asignaciones_caso` FOREIGN KEY (`id_caso`) REFERENCES `casos` (`id`);

--
-- Filtros para la tabla `casos`
--
ALTER TABLE `casos`
  ADD CONSTRAINT `fk_casos_comisaria` FOREIGN KEY (`id_comisaria`) REFERENCES `comisarias` (`id`),
  ADD CONSTRAINT `fk_casos_denunciante` FOREIGN KEY (`dni_denunciante`) REFERENCES `ciudadanos` (`dni`),
  ADD CONSTRAINT `fk_casos_tipo` FOREIGN KEY (`id_tipo`) REFERENCES `tipos_delito` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

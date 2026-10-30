package peval2acda2627;

import java.sql.Connection;
import java.util.Scanner;

public class Main {

    private static final Scanner TECLADO = new Scanner(System.in);

    public static void main(String[] args) {
        try (Connection con = Conexion.getConexion()) {
            String opcion;
            do {
                System.out.println();
                System.out.println("=== COMISARÍA ===");
                System.out.println("1. Carga masiva de agentes desde fichero de texto");
                System.out.println("2. Baja de agentes");
                System.out.println("3. Registrar un caso");
                System.out.println("4. Ficha de un agente");
                System.out.println("5. Exportar expedientes de una comisaría a XML");
                System.out.println("0. Salir");
                opcion = leer("Opción: ");
                try {
                    switch (opcion) {
                        case "1" -> CargaAgentes.cargar(con);
                        case "2" -> BajaAgentes.baja(con, leer("Placa del agente: "),
                                leer("Id de la comisaría de destino (vacío para dar de baja): "));
                        case "3" -> RegistroCaso.registrar(con,
                                leer("DNI del denunciante: "),
                                leer("Id del tipo de delito: "),
                                leer("Id de la comisaría: "),
                                leer("Descripción: "),
                                leer("Placa del agente instructor: "));
                        case "4" -> FichaAgente.mostrar(con, leer("Placa del agente: "));
                        case "5" -> exportar(con);
                        case "0" -> System.out.println("Hasta luego");
                        default -> System.out.println("Opción no válida");
                    }
                } catch (Exception e) {
                    System.out.println("Error: " + e.getMessage());
                }
            } while (!opcion.equals("0"));
        } catch (Exception e) {
            System.out.println("No se pudo conectar con la base de datos: " + e.getMessage());
        }
    }

    private static void exportar(Connection con) throws Exception {
        String texto = leer("Id de la comisaría: ");
        try {
            ExportarXml.exportar(con, Integer.parseInt(texto));
        } catch (NumberFormatException e) {
            System.out.println("El id de la comisaría debe ser un número");
        }
    }

    private static String leer(String mensaje) {
        System.out.print(mensaje);
        return TECLADO.hasNextLine() ? TECLADO.nextLine().trim() : "0";
    }
}
